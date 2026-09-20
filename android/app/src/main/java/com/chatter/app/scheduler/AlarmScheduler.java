package com.chatter.app.scheduler;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import org.json.JSONObject;

/** Wraps AlarmManager so we can set exact wake-ups where the OS lets us. */
public final class AlarmScheduler {

    private AlarmScheduler() {
    }

    public static boolean canScheduleExactly(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true;
        AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        return am != null && am.canScheduleExactAlarms();
    }

    private static PendingIntent intentFor(Context context, String id) {
        Intent intent = new Intent(context, AlarmReceiver.class);
        intent.setAction("com.chatter.app.scheduler.FIRE");
        intent.putExtra("id", id);
        return PendingIntent.getBroadcast(
                context,
                id.hashCode(),
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    public static void schedule(Context context, JSONObject entry) {
        String id = entry.optString("id");
        long when = entry.optLong("fireAt", 0L);
        if (id.isEmpty() || when <= 0L) return;

        AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;

        PendingIntent pi = intentFor(context, id);
        try {
            if (canScheduleExactly(context)) {
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, when, pi);
            } else {
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, when, pi);
            }
        } catch (SecurityException ignore) {
            am.set(AlarmManager.RTC_WAKEUP, when, pi);
        }
    }

    public static void cancel(Context context, String id) {
        if (id == null || id.isEmpty()) return;
        AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        am.cancel(intentFor(context, id));
    }

    public static void rescheduleAll(Context context, ScheduleStore store) {
        for (JSONObject entry : store.pending()) {
            schedule(context, entry);
        }
    }
}
