package com.chatter.app.scheduler;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

import org.json.JSONObject;

/**
 * Fired by AlarmManager at the scheduled time, even if the app is on the home
 * screen or fully closed. Records the message as "delivered" exactly once and
 * raises the on-phone notification. The web layer pulls the delivered entry in
 * (on next launch / resume) and inserts it into the chat.
 */
public class AlarmReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        String id = intent.getStringExtra("id");
        if (id == null || id.isEmpty()) return;

        ScheduleStore store = new ScheduleStore(context);

        JSONObject entry = store.takePending(id);
        if (entry == null) {
            // The app is open and already fired this one through the bridge.
            return;
        }

        if (store.fireOnce(id)) {
            store.recordDelivered(entry);
            Notifier.notify(context, entry);
        }
    }
}
