import { Exception } from '@clov-std/error';
import { afterEach, describe, expect, test } from 'bun:test';

import { Registry, REGISTRY_ERROR_KEYS } from '#/registry';

class FakeService {
	public readonly value: string;

	public constructor(value: string) {
		this.value = value;
	}
}

afterEach(() => {
	Registry.clear();
});

describe.concurrent('Registry', () => {
	describe('register / get', () => {
		test('should store and return the exact same instance', () => {
			const service = new FakeService('original');
			Registry.register('Service', service);

			const retrieved = Registry.get<FakeService>('Service');
			expect(retrieved).toBe(service);
			expect(retrieved.value).toBe('original');
		});

		test('should throw on duplicate registration', () => {
			Registry.register('Service', new FakeService('first'));

			try {
				Registry.register('Service', new FakeService('second'));
				expect.unreachable('Should have thrown');
			} catch (error) {
				expect(error).toBeInstanceOf(Exception);
				expect((error as Exception).key).toBe(
					REGISTRY_ERROR_KEYS.CLASS_INSTANCE_ALREADY_REGISTERED
				);
			}
		});

		test('should throw when getting an unregistered name', () => {
			try {
				Registry.get('Unknown');
				expect.unreachable('Should have thrown');
			} catch (error) {
				expect(error).toBeInstanceOf(Exception);
				expect((error as Exception).key).toBe(
					REGISTRY_ERROR_KEYS.CLASS_INSTANCE_NOT_REGISTERED
				);
			}
		});

		test('should support multiple independent registrations', () => {
			const a = new FakeService('a');
			const b = new FakeService('b');

			Registry.register('A', a);
			Registry.register('B', b);

			expect(Registry.get<FakeService>('A')).toBe(a);
			expect(Registry.get<FakeService>('B')).toBe(b);
		});
	});

	describe('unregister', () => {
		test('should remove a registered instance', () => {
			Registry.register('Service', new FakeService('x'));
			Registry.unregister('Service');

			expect(Registry.has('Service')).toBe(false);
		});

		test('should throw when unregistering an unknown name', () => {
			try {
				Registry.unregister('Ghost');
				expect.unreachable('Should have thrown');
			} catch (error) {
				expect(error).toBeInstanceOf(Exception);
				expect((error as Exception).key).toBe(
					REGISTRY_ERROR_KEYS.CLASS_INSTANCE_NOT_REGISTERED
				);
			}
		});

		test('should allow re-registration after unregistering', () => {
			const first = new FakeService('v1');
			const second = new FakeService('v2');

			Registry.register('Service', first);
			Registry.unregister('Service');
			Registry.register('Service', second);

			expect(Registry.get<FakeService>('Service')).toBe(second);
		});
	});

	describe('has', () => {
		test('should return true for registered and false for unregistered names', () => {
			expect(Registry.has('Service')).toBe(false);

			Registry.register('Service', new FakeService('x'));
			expect(Registry.has('Service')).toBe(true);
		});
	});

	describe('clear', () => {
		test('should remove all registered instances', () => {
			Registry.register('A', new FakeService('a'));
			Registry.register('B', new FakeService('b'));

			Registry.clear();

			expect(Registry.has('A')).toBe(false);
			expect(Registry.has('B')).toBe(false);
		});
	});
});
