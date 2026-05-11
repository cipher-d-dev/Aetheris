package com.aetheris

import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.bridge.ReactContextBaseJavaModule // Ensure this is explicitly here

@ReactModule(name = AetherisModule.NAME)
class AetherisModule(private val reactContext: ReactApplicationContext): ReactContextBaseJavaModule(reactContext) {
    companion object {
        const val NAME = "AetherisNativeModule"
    }

    override fun getName(): String = NAME

    // Emit events to JavaScript
    fun sendEvent(eventName: String, params: WritableMap?) {
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, params)
    }

    // Day 2: BLE methods will go here
    // Day 3: WiFi Direct methods will go here

    @ReactMethod
    fun addListener(eventName: String) { /* Required for RN event emitter */ }

    @ReactMethod
    fun removeListeners(count: Int) { /* Required for RN event emitter */ }
}