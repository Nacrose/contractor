import 'package:flutter_test/flutter_test.dart';
import 'package:construction_client/storage/browser_storage_adapter.dart';

void main() {
  group('BrowserStorageAdapter (M01-T03)', () {
    late BrowserStorageAdapter adapter;

    setUp(() async {
      adapter = BrowserStorageAdapter();
      await adapter.init();
    });

    test('performs CRUD operations without native plugins', () async {
      const table = 'TestEntities';
      const id = 'entity-01';
      final sampleData = {'id': id, 'name': 'Foundation Slab', 'volume': 150.0};

      // Put
      await adapter.put(table, id, sampleData);
      expect(adapter.count(table), 1);

      // Get
      final retrieved = await adapter.get(table, id);
      expect(retrieved, isNotNull);
      expect(retrieved!['name'], 'Foundation Slab');
      expect(retrieved['volume'], 150.0);

      // Query
      final results = await adapter.query(table, predicate: (item) => (item['volume'] as double) > 100);
      expect(results.length, 1);

      // Delete
      await adapter.delete(table, id);
      expect(adapter.count(table), 0);
      expect(await adapter.get(table, id), isNull);
    });

    test('executes 1,000 record benchmark with high throughput and data integrity', () async {
      final res = await adapter.runBenchmark(recordCount: 1000);

      expect(res.recordCount, 1000);
      expect(res.integrityVerified, isTrue);
      expect(res.writeDurationMs, greaterThan(0));
      expect(res.readDurationMs, greaterThan(0));
      expect(res.writeThroughputOpsPerSec, greaterThan(1000));
      expect(res.readThroughputOpsPerSec, greaterThan(1000));
    });
  });
}
