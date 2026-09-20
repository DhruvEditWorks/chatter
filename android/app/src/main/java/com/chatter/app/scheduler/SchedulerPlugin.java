package com.chatter.app.scheduler;

import android.Manifest;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONObject;

import java.util.List;

/**
 * Capacitor bridge for the scheduled-message alarm system.
 *
 * The web layer keeps the chat state; this plugin keeps the OS-side queue and
 * raises notifications even while the app is backgrounded / closed.
 */
@CapacitorPlugin(
        name = "ChatterScheduler",
        permissions = {
                @Permission(strings = {Manifest.permission.POST_NOTIFICATIONS}, alias = "notifications")
        }
)
public class SchedulerPlugin extends Plugin {

    private ScheduleStore store;

    @Override
    public void load() {
        store = new ScheduleStore(getContext());
    }

    /* ------------------------------------------------------------- lifecycle */

    private ScheduleStore store() {
        if (store == null) store = new ScheduleStore(getContext());
        return store;
    }

    /* ------------------------------------------------------------ permissions */

    @PluginMethod
    public void askPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 33) {
            requestPermissionForAlias("notifications", call, "permCallback");
        } else {
            JSObject ret = new JSObject();
            ret.put("granted", true);
            call.resolve(ret);
        }
    }

    @PermissionCallback
    private void permCallback(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("granted", getPermissionState("notifications") == PermissionState.GRANTED);
        call.resolve(ret);
    }

    @PluginMethod
    public void status(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("native", true);
        ret.put("exactAlarms", AlarmScheduler.canScheduleExactly(getContext()));

        boolean notifications;
        if (Build.VERSION.SDK_INT >= 33) {
            notifications = getPermissionState("notifications") == PermissionState.GRANTED;
        } else {
            notifications = true;
        }
        ret.put("notifications", notifications);
        call.resolve(ret);
    }

    @PluginMethod
    public void openAlarmSettings(PluginCall call) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                Intent intent = new Intent(
                        Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM,
                        Uri.parse("package:" + getContext().getPackageName()));
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(intent);
            }
            call.resolve();
        } catch (Exception e) {
            call.resolve();
        }
    }

    /* -------------------------------------------------------------- scheduling */

    @PluginMethod
    public void schedule(PluginCall call) {
        JSONObject entry = call.getObject("entry");
        if (entry != null) {
            store().putPending(entry);
            AlarmScheduler.schedule(getContext(), entry);
        }
        call.resolve();
    }

    @PluginMethod
    public void sync(PluginCall call) {
        JSArray entries = call.getArray("entries");
        // Replace the pending queue with exactly this list.
        ScheduleStore store = store();
        for (JSONObject existing : store.pending()) {
            store.removePending(existing.optString("id"));
        }
        if (entries != null) {
            for (int i = 0; i < entries.length(); i++) {
                JSONObject entry = entries.optJSONObject(i);
                if (entry == null) continue;
                store.putPending(entry);
                AlarmScheduler.schedule(getContext(), entry);
            }
        }
        call.resolve();
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        String id = call.getString("id");
        if (id != null) {
            AlarmScheduler.cancel(getContext(), id);
            store().clearId(id);
        }
        call.resolve();
    }

    @PluginMethod
    public void markApplied(PluginCall call) {
        String id = call.getString("id");
        if (id != null) {
            store().clearId(id);
        }
        call.resolve();
    }

    /** Fire the given entries now (idempotent) and return the delivered queue. */
    @PluginMethod
    public void fireAndDrain(PluginCall call) {
        ScheduleStore store = store();
        JSArray entries = call.getArray("entries");
        if (entries != null) {
            for (int i = 0; i < entries.length(); i++) {
                JSONObject entry = entries.optJSONObject(i);
                if (entry == null) continue;
                if (store.fireOnce(entry.optString("id"))) {
                    store.recordDelivered(entry);
                    Notifier.notify(getContext(), entry);
                }
            }
        }
        call.resolve(toDeliveredResult(store));
    }

    /** Return and clear the delivered queue (used on launch / resume). */
    @PluginMethod
    public void takeDelivered(PluginCall call) {
        call.resolve(toDeliveredResult(store()));
    }

    private JSObject toDeliveredResult(ScheduleStore store) {
        JSObject ret = new JSObject();
        List<JSONObject> delivered = store.drainDelivered();
        JSArray arr = new JSArray();
        for (JSONObject entry : delivered) arr.put(entry);
        ret.put("entries", arr);
        return ret;
    }
}
