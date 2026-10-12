import 'package:flutter_test/flutter_test.dart';
import 'package:construction_client/mount/system_browser.dart';

/// Binding tests for the system-browser port (M04-T02): the ONLY launch
/// mechanism is the EXTERNAL system browser (no WebView), and the deep-link
/// callback resolves through the sink the host feeds.
void main() {
  group('UrlLauncherSystemBrowserPort', () {
    test('open launches the authorize URL externally; a refused launch fail-closes', () async {
      final launched = <String, Map<String, Object?>>{};
      final port = UrlLauncherSystemBrowserPort(
        launchFn: (url, options) async {
          launched[url] = options;
          return true;
        },
      );

      await port.open('https://accounts.example.com/authorize?state=abc');
      expect(
        launched.keys.single,
        'https://accounts.example.com/authorize?state=abc',
      );
      expect(
        launched.values.single['mode'],
        'external',
        reason: 'credentials.ts: the client has NO WebView surface at all',
      );

      final refusing = UrlLauncherSystemBrowserPort(
        launchFn: (url, options) async => false,
      );
      await expectLater(
        refusing.open('https://accounts.example.com/authorize'),
        throwsStateError,
        reason: 'fail-closed: never fall back to a WebView or inline flow',
      );
    });

    test('awaitCallback resolves when the host delivers the redirect (before-await race buffered)', () async {
      final sink = DeepLinkSink();
      final port = UrlLauncherSystemBrowserPort(
        linkSink: sink,
        launchFn: (url, options) async => true,
      );

      // Case 1: callback arrives BEFORE awaitCallback is called (warm-start).
      sink.deliver('app://callback?code=x&state=s');
      expect(await port.awaitCallback(), 'app://callback?code=x&state=s');

      // Case 2: awaitCallback first, callback after (cold start).
      final future = port.awaitCallback();
      sink.deliver('app://callback?code=y&state=s2');
      expect(await future, 'app://callback?code=y&state=s2');
    });

    test('awaitCallback surfaces a user-cancel as an error (no fabricated callback)', () async {
      final sink = DeepLinkSink();
      final port = UrlLauncherSystemBrowserPort(
        linkSink: sink,
        launchFn: (url, options) async => true,
      );

      final future = port.awaitCallback();
      sink.fail(StateError('user cancelled'));
      await expectLater(future, throwsStateError);
    });

    test('only the exact registered callback reaches the auth sink', () async {
      final sink = DeepLinkSink();
      final port = UrlLauncherSystemBrowserPort(
        linkSink: sink,
        launchFn: (url, options) async => true,
      );
      final waiting = port.awaitCallback();

      port.handleCallbackUri(
        Uri.parse('https://contractor.example/auth/callback?code=no'),
      );
      port.handleCallbackUri(
        Uri.parse(
          'com.nacrose.contractor.constructionclient://auth/other?code=no',
        ),
      );

      const callback =
          'com.nacrose.contractor.constructionclient://auth/callback?code=abc&state=xyz';
      port.handleCallbackUri(Uri.parse(callback));
      expect(await waiting, callback);
    });

    test('duplicate callback delivery is suppressed', () async {
      final sink = DeepLinkSink();
      final port = UrlLauncherSystemBrowserPort(
        linkSink: sink,
        launchFn: (url, options) async => true,
      );
      const callback =
          'com.nacrose.contractor.constructionclient://auth/callback?code=abc&state=xyz';
      port.handleCallbackUri(Uri.parse(callback));
      port.handleCallbackUri(Uri.parse(callback));

      expect(await port.awaitCallback(), callback);
    });
  });
}
