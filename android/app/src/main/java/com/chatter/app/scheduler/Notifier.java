package com.chatter.app.scheduler;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import com.chatter.app.MainActivity;
import com.chatter.app.R;

import org.json.JSONObject;

import java.util.Random;

/** Posts the on-phone notification when a scheduled message fires. */
public final class Notifier {

    public static final String CHANNEL_ID = "chatter_scheduled";
    private static final Random RANDOM = new Random();

    private Notifier() {
    }

    public static void ensureChannel(Context context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager manager =
                    (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager != null && manager.getNotificationChannel(CHANNEL_ID) == null) {
                NotificationChannel channel = new NotificationChannel(
                        CHANNEL_ID,
                        "Scheduled messages",
                        NotificationManager.IMPORTANCE_HIGH);
                channel.setDescription("Reminders and messages you scheduled in Chatter.");
                channel.enableVibration(true);
                manager.createNotificationChannel(channel);
            }
        }
    }

    public static void notify(Context context, JSONObject entry) {
        ensureChannel(context);

        String title = entry.optString("title", "Chatter");
        String body = entry.optString("body", "");

        Intent tap = new Intent(context, MainActivity.class);
        tap.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pending = PendingIntent.getActivity(
                context,
                0,
                tap,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_stat_chatter)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                .setAutoCancel(true)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(NotificationCompat.CATEGORY_REMINDER)
                .setContentIntent(pending);

        try {
            NotificationManagerCompat.from(context).notify(RANDOM.nextInt(100000) + 1, builder.build());
        } catch (SecurityException ignore) {
            // POST_NOTIFICATIONS denied (Android 13+). Nothing we can do here.
        }
    }
}
