package com.xenix.plugins.audiorecorder

enum class RecorderState(val value: String) {
    INACTIVE("inactive"),
    RECORDING("recording"),
    PAUSED("paused"),
    INITIALIZING("initializing"),
    ERROR("error"),
    STOPPING("stopping")
}
