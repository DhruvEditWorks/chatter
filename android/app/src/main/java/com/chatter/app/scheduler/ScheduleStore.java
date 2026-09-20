package com.chatter.app.scheduler;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;

/**
 * Tiny persistent queue used by the scheduled-message alarm system.
 *
 * Three buckets, all in SharedPreferences:
 *   pending   - messages that still have to fire (id -> entry)
 *   fired     - ids that already fired (guards against double fire)
 *   delivered - entries that fired while the app was closed, waiting for the
 *               web layer to pull them in and insert them into the chat
 */
public final class ScheduleStore {

    private static final String PREFS = "chatter_schedules";
    private static final String KEY_PENDING = "pending";
    private static final String KEY_FIRED = "fired";
    private static final String KEY_DELIVERED = "delivered";

    private final SharedPreferences prefs;

    public ScheduleStore(Context context) {
        this.prefs = context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /* ----------------------------------------------------------- raw access */

    private JSONObject readObject(String key) {
        try {
            String raw = prefs.getString(key, null);
            return raw == null ? new JSONObject() : new JSONObject(raw);
        } catch (JSONException e) {
            return new JSONObject();
        }
    }

    private JSONArray readArray(String key) {
        try {
            String raw = prefs.getString(key, null);
            return raw == null ? new JSONArray() : new JSONArray(raw);
        } catch (JSONException e) {
            return new JSONArray();
        }
    }

    private void write(String key, Object value) {
        prefs.edit().putString(key, value.toString()).apply();
    }

    /* ---------------------------------------------------------------- pending */

    public void putPending(JSONObject entry) {
        String id = entry.optString("id");
        if (id.isEmpty()) return;
        JSONObject pending = readObject(KEY_PENDING);
        try {
            pending.put(id, entry);
        } catch (JSONException ignore) {
        }
        write(KEY_PENDING, pending);
    }

    public JSONObject takePending(String id) {
        JSONObject pending = readObject(KEY_PENDING);
        JSONObject entry = pending.optJSONObject(id);
        if (entry != null) {
            pending.remove(id);
            write(KEY_PENDING, pending);
        }
        return entry;
    }

    public void removePending(String id) {
        JSONObject pending = readObject(KEY_PENDING);
        pending.remove(id);
        write(KEY_PENDING, pending);
    }

    public List<JSONObject> pending() {
        List<JSONObject> out = new ArrayList<>();
        JSONObject pending = readObject(KEY_PENDING);
        Iterator<String> keys = pending.keys();
        while (keys.hasNext()) {
            JSONObject e = pending.optJSONObject(keys.next());
            if (e != null) out.add(e);
        }
        return out;
    }

    /* ------------------------------------------------------------------ fired */

    /** Returns true exactly once per id, marking it fired. */
    public boolean fireOnce(String id) {
        JSONObject fired = readObject(KEY_FIRED);
        if (fired.has(id)) return false;
        try {
            fired.put(id, System.currentTimeMillis());
        } catch (JSONException ignore) {
        }
        write(KEY_FIRED, fired);
        return true;
    }

    /* -------------------------------------------------------------- delivered */

    public void recordDelivered(JSONObject entry) {
        String id = entry.optString("id");
        if (id.isEmpty()) return;
        JSONArray delivered = readArray(KEY_DELIVERED);
        // de-dup by id
        for (int i = 0; i < delivered.length(); i++) {
            if (id.equals(delivered.optJSONObject(i) != null ? delivered.optJSONObject(i).optString("id") : null)) {
                return;
            }
        }
        delivered.put(entry);
        write(KEY_DELIVERED, delivered);
    }

    /** Returns and clears the delivered queue. */
    public List<JSONObject> drainDelivered() {
        JSONArray delivered = readArray(KEY_DELIVERED);
        List<JSONObject> out = new ArrayList<>();
        for (int i = 0; i < delivered.length(); i++) {
            JSONObject e = delivered.optJSONObject(i);
            if (e != null) out.add(e);
        }
        write(KEY_DELIVERED, new JSONArray());
        return out;
    }

    /* ------------------------------------------------------------------ cancel */

    public void clearId(String id) {
        removePending(id);

        JSONObject fired = readObject(KEY_FIRED);
        fired.remove(id);
        write(KEY_FIRED, fired);

        JSONArray delivered = readArray(KEY_DELIVERED);
        JSONArray kept = new JSONArray();
        for (int i = 0; i < delivered.length(); i++) {
            JSONObject e = delivered.optJSONObject(i);
            if (e != null && id.equals(e.optString("id"))) continue;
            if (e != null) kept.put(e);
        }
        write(KEY_DELIVERED, kept);
    }
}
