package com.chatter.app.scheduler;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * Android kills exact alarms on reboot. Re-arm every pending scheduled
 * message as soon as the device finishes booting.
 */
public class BootReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        if (action == null) return;
        if (Intent.ACTION_BOOT_COMPLETED.equals(action)
                || Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)
                || Intent.ACTION_LOCKED_BOOT_COMPLETED.equals(action)) {
            ScheduleStore store = new ScheduleStore(context);
            AlarmScheduler.rescheduleAll(context, store);
        }
    }
}
