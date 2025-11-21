package com.xenix.plugins.audiorecorder;

import com.getcapacitor.Logger;

public class AudioRecorder {

    public String echo(String value) {
        Logger.info("Echo", value);
        return value;
    }
}
