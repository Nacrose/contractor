import 'package:flutter/material.dart';

import 'pdf/kernel_candidate_comparison.dart';
import 'pdf/m01_t10_fixture.dart';

void main() => runApp(const PdfKernelComparisonApp());

class PdfKernelComparisonApp extends StatefulWidget {
  const PdfKernelComparisonApp({super.key});

  @override
  State<PdfKernelComparisonApp> createState() => _PdfKernelComparisonAppState();
}

class _PdfKernelComparisonAppState extends State<PdfKernelComparisonApp> {
  late final Future<List<_RunOutcome>> _outcomes = _runCandidates();

  Future<List<_RunOutcome>> _runCandidates() async {
    final fixture = createM01T10PdfFixture();
    final candidates = <PdfKernelCandidate>[
      PdfrxPdfiumCandidate(),
      PdfxPlatformCandidate(),
    ];
    final outcomes = <_RunOutcome>[];
    for (final candidate in candidates) {
      final stopwatch = Stopwatch()..start();
      final runs = <PdfCandidateResult>[];
      String? failure;
      try {
        for (var run = 0; run < 10; run++) {
          runs.add(
            await candidate.openRenderClose(
              fixture,
              renderWidth: 640,
              renderHeight: 480,
            ),
          );
        }
      } catch (error, stackTrace) {
        debugPrint('M01-T10 ${candidate.name} failed: $error\n$stackTrace');
        failure = '$error';
      }
      stopwatch.stop();
      final outcome = _RunOutcome(
        name: candidate.name,
        results: runs,
        failure: failure,
        totalElapsedMicros: stopwatch.elapsedMicroseconds,
        supportsRenderCancellation: candidate.supportsRenderCancellation,
      );
      debugPrint('M01-T10 $outcome');
      outcomes.add(outcome);
    }
    return outcomes;
  }

  @override
  Widget build(BuildContext context) => MaterialApp(
    title: 'M01 PDF Kernel Comparison',
    theme: ThemeData(colorScheme: ColorScheme.fromSeed(seedColor: Colors.blue)),
    home: Scaffold(
      appBar: AppBar(title: const Text('M01-T10 PDF renderer comparison')),
      body: FutureBuilder<List<_RunOutcome>>(
        future: _outcomes,
        builder: (context, snapshot) {
          if (!snapshot.hasData) {
            return const Center(child: CircularProgressIndicator());
          }
          return ListView(
            padding: const EdgeInsets.all(24),
            children: [
              const Text(
                'Disposable renderer experiment. Fixture is a generated '
                'one-page PDF; this is not the 200 MB performance gate.',
              ),
              const SizedBox(height: 16),
              for (final outcome in snapshot.data!)
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Text(outcome.toString()),
                  ),
                ),
            ],
          );
        },
      ),
    ),
  );
}

class _RunOutcome {
  const _RunOutcome({
    required this.name,
    required this.results,
    required this.totalElapsedMicros,
    required this.supportsRenderCancellation,
    this.failure,
  });

  final String name;
  final List<PdfCandidateResult> results;
  final String? failure;
  final int totalElapsedMicros;
  final bool supportsRenderCancellation;

  @override
  String toString() {
    if (results.isEmpty) {
      return '$name failed after ${totalElapsedMicros}us: $failure; '
          'cancellation=$supportsRenderCancellation';
    }
    final warm = results.skip(1).map((r) => r.elapsedMicros).toList()..sort();
    final p50 = (warm[(warm.length - 1) ~/ 2] + warm[warm.length ~/ 2]) ~/ 2;
    final p95 =
        warm[((warm.length * 0.95).ceil() - 1).clamp(0, warm.length - 1)];
    final first = results.first;
    return '$name runs=${results.length} coldOpenRenderClose='
        '${first.elapsedMicros}us warmOpenRenderCloseP50=${p50}us '
        'warmP95=${p95}us page=${first.pageWidth}x${first.pageHeight} '
        'outputBytes=${first.outputBytes} '
        'closed=${first.explicitlyClosed} '
        'cancel=$supportsRenderCancellation'
        '${failure == null ? '' : ' failed=$failure'}';
  }
}
