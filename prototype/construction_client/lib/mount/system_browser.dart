/// System browser binding (M04-T02).
///
/// Binds the M03-T02 SystemBrowserPort (lifecycle.ts lines 80-85) to the
/// platform browser via url_launcher: the browser opens EXTERNALLY (Custom
/// Tabs / ASWebAuthenticationSession-eligible system browser — never an
/// in-app WebView; this client has no WebView surface at all). The
/// deep-link callback resolves through a [DeepLinkSink] the host app feeds
/// from its per-platform deep-link wiring (M04-T03).
library;

import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:url_launcher/url_launcher.dart';

import 'ports.dart';

/// Sink the host's deep-link wiring delivers redirect URLs into. Buffers a
/// callback that arrives before awaitCallback (warm-start race) so the
/// identity flow can await it right after opening the browser.
class DeepLinkSink {
  Completer<String>? _pending;
  final List<String> _buffer = [];

  Future<String> next() {
    if (_buffer.isNotEmpty) {
      return Future<String>.value(_buffer.removeAt(0));
    }
    return (_pending ??= Completer<String>()).future;
  }

  void deliver(String callbackUrl) {
    final pending = _pending;
    if (pending != null && !pending.isCompleted) {
      _pending = null;
      pending.complete(callbackUrl);
    } else {
      _buffer.add(callbackUrl);
    }
  }

  /// A user cancel / browser abandonment fails the in-flight await.
  void fail(Object error) {
    final pending = _pending;
    if (pending != null && !pending.isCompleted) {
      _pending = null;
      pending.completeError(error);
    }
  }
}

/// Injectable launch seam — the production default is url_launcher's
/// external-application launch; tests inject a recording spy.
typedef UrlLaunchFn = Future<bool> Function(String url, Map<String, Object?> options);

Future<bool> _defaultLaunch(String url, Map<String, Object?> options) {
  return launchUrl(
    Uri.parse(url),
    mode: LaunchMode.externalApplication,
  );
}

class UrlLauncherSystemBrowserPort implements SystemBrowserPort {
  final DeepLinkSink sink;
  final UrlLaunchFn _launch;

  UrlLauncherSystemBrowserPort({DeepLinkSink? linkSink, UrlLaunchFn? launchFn})
      : sink = linkSink ?? DeepLinkSink(),
        _launch = launchFn ?? _defaultLaunch;

  @override
  Future<void> open(String authorizeUrl) async {
    if (kIsWeb) {
      // On web the browser is the host itself; sign-in redirects in place.
      await _launch(authorizeUrl, const {'mode': 'external'});
      return;
    }
    final ok = await _launch(authorizeUrl, const {'mode': 'external'});
    if (!ok) {
      throw StateError('System browser refused to open the authorize URL; refusing to fall back to a WebView.');
    }
  }

  @override
  Future<String> awaitCallback() => sink.next();
}
