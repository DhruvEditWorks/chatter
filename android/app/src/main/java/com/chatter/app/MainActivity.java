package com.chatter.app;

import android.os.Bundle;

import com.chatter.app.scheduler.SchedulerPlugin;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SchedulerPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
