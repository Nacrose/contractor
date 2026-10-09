package com.nacrose.contractor.construction_client

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

/**
 * M04-T02 secure-credential binding (mount/lib/mount/secure_store.dart).
 *
 * Binds the mount's `construction_client/secure_store` method channel to
 * the Android Keystore-backed EncryptedSharedPreferences — the ONLY
 * sanctioned credential surface on Android (packages/native_identity
 * credentials.ts: filesystem, plain SharedPreferences, SQLite are protocol
 * violations). The Dart side fail-closes on any channel error; it never
 * falls back to non-secure storage.
 */
class MainActivity : FlutterActivity() {
    private var securePrefs: SharedPreferences? = null

    private fun prefs(): SharedPreferences {
        val existing = securePrefs
        if (existing != null) return existing
        val masterKey = MasterKey.Builder(this)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        val created = EncryptedSharedPreferences.create(
            this,
            "cm_secure_credentials",
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
        securePrefs = created
        return created
    }

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        flutterEngine.dartExecutor.binaryMessenger.let { messenger ->
            MethodChannel(messenger, "construction_client/secure_store")
                .setMethodCallHandler { call, result ->
                    try {
                        when (call.method) {
                            "save" -> {
                                val ref = call.argument<String>("ref")
                                val value = call.argument<String>("value")
                                if (ref.isNullOrEmpty() || value == null) {
                                    result.error("bad_request", "ref and value are required", null)
                                    return@setMethodCallHandler
                                }
                                prefs().edit().putString(ref, value).commit()
                                result.success(null)
                            }
                            "load" -> {
                                val ref = call.argument<String>("ref")
                                if (ref.isNullOrEmpty()) {
                                    result.error("bad_request", "ref is required", null)
                                    return@setMethodCallHandler
                                }
                                result.success(prefs().getString(ref, null))
                            }
                            "delete" -> {
                                val ref = call.argument<String>("ref")
                                if (ref.isNullOrEmpty()) {
                                    result.error("bad_request", "ref is required", null)
                                    return@setMethodCallHandler
                                }
                                prefs().edit().remove(ref).commit()
                                result.success(null)
                            }
                            "wipeAll" -> {
                                prefs().edit().clear().commit()
                                result.success(null)
                            }
                            else -> result.notImplemented()
                        }
                    } catch (e: Exception) {
                        // Keystore/store failure -> typed Dart-side fail-closed
                        // (CredentialStoreUnavailable). No non-secure fallback.
                        result.error("store_unavailable", e.message, null)
                    }
                }
        }
    }
}
