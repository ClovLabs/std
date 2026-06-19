import { describe, expect, mock, test } from 'bun:test';

import { TypedEventEmitter } from '#/typed-event-emitter';
import type { EventMap } from '#/types/event-map';

const testData = {
	eventNames: {
		testEvent: 'testEvent',
		dataEvent: 'dataEvent'
	} as const,
	payloads: {
		string: 'test payload',
		stringFirst: 'first emission',
		stringSecond: 'second emission',
		stringAgain: 'test payload again',
		object: { id: 123, value: 'test value' }
	} as const
} as const;

interface NoPayloadEventMap extends EventMap {
	testEvent: [];
}

interface StringEventMap extends EventMap {
	testEvent: [string];
}

interface ObjectEventMap extends EventMap {
	dataEvent: [{ id: number; value: string }];
}

interface MultiEventMap extends EventMap {
	testEvent: [string];
	dataEvent: [{ id: number; value: string }];
}

const createEmitter = <TEvents extends EventMap>(): TypedEventEmitter<TEvents> =>
	new TypedEventEmitter<TEvents>();

describe.concurrent('TypedEventEmitter', () => {
	describe('Core Event Emission and Listening', () => {
		describe('emit and on', () => {
			test('should emit an event with no payload', () => {
				const emitter = createEmitter<NoPayloadEventMap>();
				const mockListener = mock(() => {});

				emitter.on(testData.eventNames.testEvent, mockListener);
				emitter.emit(testData.eventNames.testEvent);

				expect(mockListener).toHaveBeenCalledTimes(1);
				expect(mockListener).toHaveBeenCalledWith();
			});

			test('should emit an event with string payload', () => {
				const emitter = createEmitter<StringEventMap>();
				const mockListener = mock(() => {});

				emitter.on(testData.eventNames.testEvent, mockListener);
				emitter.emit(testData.eventNames.testEvent, testData.payloads.string);

				expect(mockListener).toHaveBeenCalledTimes(1);
				expect(mockListener).toHaveBeenCalledWith(testData.payloads.string);
			});

			test('should emit an event with object payload', () => {
				const emitter = createEmitter<ObjectEventMap>();
				const mockListener = mock(() => {});

				emitter.on(testData.eventNames.dataEvent, mockListener);
				emitter.emit(testData.eventNames.dataEvent, testData.payloads.object);

				expect(mockListener).toHaveBeenCalledTimes(1);
				expect(mockListener).toHaveBeenCalledWith(testData.payloads.object);
			});

			test('should handle multiple different event types', () => {
				const emitter = createEmitter<MultiEventMap>();
				const stringListener = mock(() => {});
				const objectListener = mock(() => {});

				emitter.on(testData.eventNames.testEvent, stringListener);
				emitter.on(testData.eventNames.dataEvent, objectListener);

				emitter.emit(testData.eventNames.testEvent, testData.payloads.string);
				emitter.emit(testData.eventNames.dataEvent, testData.payloads.object);

				expect(stringListener).toHaveBeenCalledTimes(1);
				expect(stringListener).toHaveBeenCalledWith(testData.payloads.string);
				expect(objectListener).toHaveBeenCalledTimes(1);
				expect(objectListener).toHaveBeenCalledWith(testData.payloads.object);
			});
		});

		describe('once', () => {
			test('should listen to an event only once', () => {
				const emitter = createEmitter<StringEventMap>();
				const mockListener = mock(() => {});

				emitter.once(testData.eventNames.testEvent, mockListener);
				emitter.emit(testData.eventNames.testEvent, testData.payloads.stringFirst);
				emitter.emit(testData.eventNames.testEvent, testData.payloads.stringSecond);

				expect(mockListener).toHaveBeenCalledTimes(1);
				expect(mockListener).toHaveBeenCalledWith(testData.payloads.stringFirst);
			});

			test('should work with multiple once listeners', () => {
				const emitter = createEmitter<StringEventMap>();
				const firstListener = mock(() => {});
				const secondListener = mock(() => {});

				emitter.once(testData.eventNames.testEvent, firstListener);
				emitter.once(testData.eventNames.testEvent, secondListener);

				emitter.emit(testData.eventNames.testEvent, testData.payloads.string);
				emitter.emit(testData.eventNames.testEvent, testData.payloads.stringAgain);

				expect(firstListener).toHaveBeenCalledTimes(1);
				expect(secondListener).toHaveBeenCalledTimes(1);
				expect(firstListener).toHaveBeenCalledWith(testData.payloads.string);
				expect(secondListener).toHaveBeenCalledWith(testData.payloads.string);
			});
		});
	});

	describe('Listener Management', () => {
		describe('addListener', () => {
			test('should add a listener for an event', () => {
				const emitter = createEmitter<StringEventMap>();
				const mockListener = mock(() => {});

				emitter.addListener(testData.eventNames.testEvent, mockListener);
				emitter.emit(testData.eventNames.testEvent, testData.payloads.string);

				expect(mockListener).toHaveBeenCalledTimes(1);
				expect(mockListener).toHaveBeenCalledWith(testData.payloads.string);
			});

			test('should add multiple listeners for the same event', () => {
				const emitter = createEmitter<StringEventMap>();
				const firstListener = mock(() => {});
				const secondListener = mock(() => {});

				emitter.addListener(testData.eventNames.testEvent, firstListener);
				emitter.addListener(testData.eventNames.testEvent, secondListener);
				emitter.emit(testData.eventNames.testEvent, testData.payloads.string);

				expect(firstListener).toHaveBeenCalledTimes(1);
				expect(firstListener).toHaveBeenCalledWith(testData.payloads.string);
				expect(secondListener).toHaveBeenCalledTimes(1);
				expect(secondListener).toHaveBeenCalledWith(testData.payloads.string);
			});

			test('should allow the same listener to be added multiple times', () => {
				const emitter = createEmitter<StringEventMap>();
				const mockListener = mock(() => {});

				emitter.addListener(testData.eventNames.testEvent, mockListener);
				emitter.addListener(testData.eventNames.testEvent, mockListener);
				emitter.emit(testData.eventNames.testEvent, testData.payloads.string);

				expect(mockListener).toHaveBeenCalledTimes(2);
			});
		});

		describe('removeListener', () => {
			test('should remove a specific listener', () => {
				const emitter = createEmitter<StringEventMap>();
				const firstListener = mock(() => {});
				const secondListener = mock(() => {});

				emitter.addListener(testData.eventNames.testEvent, firstListener);
				emitter.addListener(testData.eventNames.testEvent, secondListener);
				emitter.removeListener(testData.eventNames.testEvent, firstListener);
				emitter.emit(testData.eventNames.testEvent, testData.payloads.string);

				expect(firstListener).not.toHaveBeenCalled();
				expect(secondListener).toHaveBeenCalledTimes(1);
				expect(secondListener).toHaveBeenCalledWith(testData.payloads.string);
			});

			test('should handle removal of non-existent listener gracefully', () => {
				const emitter = createEmitter<StringEventMap>();
				const existingListener = mock(() => {});
				const nonExistentListener = mock(() => {});

				emitter.addListener(testData.eventNames.testEvent, existingListener);
				emitter.removeListener(testData.eventNames.testEvent, nonExistentListener);
				emitter.emit(testData.eventNames.testEvent, testData.payloads.string);

				expect(existingListener).toHaveBeenCalledTimes(1);
				expect(nonExistentListener).not.toHaveBeenCalled();
			});
		});

		describe('off', () => {
			test('should remove a specific listener (alias for removeListener)', () => {
				const emitter = createEmitter<StringEventMap>();
				const firstListener = mock(() => {});
				const secondListener = mock(() => {});

				emitter.addListener(testData.eventNames.testEvent, firstListener);
				emitter.addListener(testData.eventNames.testEvent, secondListener);
				emitter.off(testData.eventNames.testEvent, firstListener);
				emitter.emit(testData.eventNames.testEvent, testData.payloads.string);

				expect(firstListener).not.toHaveBeenCalled();
				expect(secondListener).toHaveBeenCalledTimes(1);
				expect(secondListener).toHaveBeenCalledWith(testData.payloads.string);
			});

			test('should behave identically to removeListener', () => {
				const emitter1 = createEmitter<StringEventMap>();
				const emitter2 = createEmitter<StringEventMap>();
				const listener1 = mock(() => {});
				const listener2 = mock(() => {});
				const listener3 = mock(() => {});
				const listener4 = mock(() => {});

				emitter1.addListener(testData.eventNames.testEvent, listener1);
				emitter1.addListener(testData.eventNames.testEvent, listener2);
				emitter2.addListener(testData.eventNames.testEvent, listener3);
				emitter2.addListener(testData.eventNames.testEvent, listener4);

				emitter1.removeListener(testData.eventNames.testEvent, listener1);
				emitter2.off(testData.eventNames.testEvent, listener3);

				expect(emitter1.listenerCount(testData.eventNames.testEvent)).toBe(
					emitter2.listenerCount(testData.eventNames.testEvent)
				);
			});
		});
	});

	describe('Listener Introspection', () => {
		describe('listenerCount', () => {
			test('should return the number of listeners for an event', () => {
				const emitter = createEmitter<StringEventMap>();
				const firstListener = mock(() => {});
				const secondListener = mock(() => {});

				expect(emitter.listenerCount(testData.eventNames.testEvent)).toBe(0);

				emitter.addListener(testData.eventNames.testEvent, firstListener);
				emitter.addListener(testData.eventNames.testEvent, secondListener);
				expect(emitter.listenerCount(testData.eventNames.testEvent)).toBe(2);

				emitter.removeListener(testData.eventNames.testEvent, firstListener);
				expect(emitter.listenerCount(testData.eventNames.testEvent)).toBe(1);

				emitter.removeListener(testData.eventNames.testEvent, secondListener);
				expect(emitter.listenerCount(testData.eventNames.testEvent)).toBe(0);
			});

			test('should return zero for non-existent events', () => {
				const emitter = createEmitter<StringEventMap>();
				expect(emitter.listenerCount(testData.eventNames.testEvent)).toBe(0);
			});
		});

		describe('listeners', () => {
			test('should return the listeners for an event', () => {
				const emitter = createEmitter<StringEventMap>();
				const firstListener = mock(() => {});
				const secondListener = mock(() => {});

				expect(emitter.listeners(testData.eventNames.testEvent)).toHaveLength(0);

				emitter.addListener(testData.eventNames.testEvent, firstListener);
				emitter.addListener(testData.eventNames.testEvent, secondListener);
				const listeners = emitter.listeners(testData.eventNames.testEvent);
				expect(listeners).toHaveLength(2);
				expect(listeners).toContain(firstListener);
				expect(listeners).toContain(secondListener);

				emitter.removeListener(testData.eventNames.testEvent, firstListener);
				const updatedListeners = emitter.listeners(testData.eventNames.testEvent);
				expect(updatedListeners).toHaveLength(1);
				expect(updatedListeners).not.toContain(firstListener);
				expect(updatedListeners).toContain(secondListener);

				emitter.removeListener(testData.eventNames.testEvent, secondListener);
				const finalListeners = emitter.listeners(testData.eventNames.testEvent);
				expect(finalListeners).toHaveLength(0);
				expect(finalListeners).not.toContain(firstListener);
				expect(finalListeners).not.toContain(secondListener);
			});

			test('should return a copy of the listeners array', () => {
				const emitter = createEmitter<StringEventMap>();
				const mockListener = mock(() => {});

				emitter.addListener(testData.eventNames.testEvent, mockListener);
				const listeners1 = emitter.listeners(testData.eventNames.testEvent);
				const listeners2 = emitter.listeners(testData.eventNames.testEvent);

				expect(listeners1).not.toBe(listeners2);
				expect(listeners1).toEqual(listeners2);
			});
		});

		describe('rawListeners', () => {
			test('should return the raw listeners for an event', () => {
				const emitter = createEmitter<StringEventMap>();
				const firstListener = mock(() => {});
				const secondListener = mock(() => {});

				expect(emitter.rawListeners(testData.eventNames.testEvent)).toHaveLength(0);

				emitter.addListener(testData.eventNames.testEvent, firstListener);
				emitter.addListener(testData.eventNames.testEvent, secondListener);
				const rawListeners = emitter.rawListeners(testData.eventNames.testEvent);
				expect(rawListeners).toHaveLength(2);
				expect(rawListeners).toContain(firstListener);
				expect(rawListeners).toContain(secondListener);

				emitter.removeListener(testData.eventNames.testEvent, firstListener);
				const updatedRawListeners = emitter.rawListeners(testData.eventNames.testEvent);
				expect(updatedRawListeners).toHaveLength(1);
				expect(updatedRawListeners).not.toContain(firstListener);
				expect(updatedRawListeners).toContain(secondListener);

				emitter.removeListener(testData.eventNames.testEvent, secondListener);
				const finalRawListeners = emitter.rawListeners(testData.eventNames.testEvent);
				expect(finalRawListeners).toHaveLength(0);
				expect(finalRawListeners).not.toContain(firstListener);
				expect(finalRawListeners).not.toContain(secondListener);
			});

			test('should behave consistently with listeners method', () => {
				const emitter = createEmitter<StringEventMap>();
				const mockListener = mock(() => {});

				emitter.addListener(testData.eventNames.testEvent, mockListener);

				const listeners = emitter.listeners(testData.eventNames.testEvent);
				const rawListeners = emitter.rawListeners(testData.eventNames.testEvent);

				expect(listeners).toEqual(rawListeners);
				expect(listeners.length).toBe(rawListeners.length);
			});
		});
	});

	describe('Advanced Listener Management', () => {
		describe('prependListener', () => {
			test('should add a listener to the beginning of the listeners array', () => {
				const emitter = createEmitter<StringEventMap>();
				const firstListener = mock(() => {});
				const secondListener = mock(() => {});

				emitter.addListener(testData.eventNames.testEvent, firstListener);
				emitter.prependListener(testData.eventNames.testEvent, secondListener);

				const listeners = emitter.listeners(testData.eventNames.testEvent);
				expect(listeners).toHaveLength(2);
				expect(listeners[0]).toBe(secondListener);
				expect(listeners[1]).toBe(firstListener);

				emitter.emit(testData.eventNames.testEvent, testData.payloads.string);
				expect(secondListener).toHaveBeenCalledTimes(1);
				expect(secondListener).toHaveBeenCalledWith(testData.payloads.string);
				expect(firstListener).toHaveBeenCalledTimes(1);
				expect(firstListener).toHaveBeenCalledWith(testData.payloads.string);
			});

			test('should maintain correct order with multiple prepended listeners', () => {
				const emitter = createEmitter<StringEventMap>();
				const firstListener = mock(() => {});
				const secondListener = mock(() => {});
				const thirdListener = mock(() => {});

				emitter.addListener(testData.eventNames.testEvent, firstListener);
				emitter.prependListener(testData.eventNames.testEvent, secondListener);
				emitter.prependListener(testData.eventNames.testEvent, thirdListener);

				const listeners = emitter.listeners(testData.eventNames.testEvent);
				expect(listeners).toHaveLength(3);
				expect(listeners[0]).toBe(thirdListener);
				expect(listeners[1]).toBe(secondListener);
				expect(listeners[2]).toBe(firstListener);

				emitter.emit(testData.eventNames.testEvent, testData.payloads.string);
				expect(thirdListener).toHaveBeenCalledTimes(1);
				expect(secondListener).toHaveBeenCalledTimes(1);
				expect(firstListener).toHaveBeenCalledTimes(1);
			});
		});

		describe('prependOnceListener', () => {
			test('should add a one-time listener to the beginning of the listeners array', () => {
				const emitter = createEmitter<StringEventMap>();
				const permanentListener = mock(() => {});
				const onceListener = mock(() => {});

				emitter.addListener(testData.eventNames.testEvent, permanentListener);
				emitter.prependOnceListener(testData.eventNames.testEvent, onceListener);

				const listenersBeforeEmit = emitter.listeners(testData.eventNames.testEvent);
				expect(listenersBeforeEmit).toHaveLength(2);
				expect(listenersBeforeEmit[0]).toBe(onceListener);
				expect(listenersBeforeEmit[1]).toBe(permanentListener);

				emitter.emit(testData.eventNames.testEvent, testData.payloads.string);
				expect(onceListener).toHaveBeenCalledTimes(1);
				expect(onceListener).toHaveBeenCalledWith(testData.payloads.string);
				expect(permanentListener).toHaveBeenCalledTimes(1);
				expect(permanentListener).toHaveBeenCalledWith(testData.payloads.string);

				const listenersAfterFirstEmit = emitter.listeners(testData.eventNames.testEvent);
				expect(listenersAfterFirstEmit).toHaveLength(1);
				expect(listenersAfterFirstEmit[0]).toBe(permanentListener);

				emitter.emit(testData.eventNames.testEvent, testData.payloads.stringAgain);
				expect(onceListener).toHaveBeenCalledTimes(1);
				expect(permanentListener).toHaveBeenCalledTimes(2);
			});

			test('should handle multiple prepended once listeners correctly', () => {
				const emitter = createEmitter<StringEventMap>();
				const permanentListener = mock(() => {});
				const firstOnceListener = mock(() => {});
				const secondOnceListener = mock(() => {});

				emitter.addListener(testData.eventNames.testEvent, permanentListener);
				emitter.prependOnceListener(testData.eventNames.testEvent, firstOnceListener);
				emitter.prependOnceListener(testData.eventNames.testEvent, secondOnceListener);

				const listenersBeforeEmit = emitter.listeners(testData.eventNames.testEvent);
				expect(listenersBeforeEmit).toHaveLength(3);
				expect(listenersBeforeEmit[0]).toBe(secondOnceListener);
				expect(listenersBeforeEmit[1]).toBe(firstOnceListener);
				expect(listenersBeforeEmit[2]).toBe(permanentListener);

				emitter.emit(testData.eventNames.testEvent, testData.payloads.string);
				expect(secondOnceListener).toHaveBeenCalledTimes(1);
				expect(firstOnceListener).toHaveBeenCalledTimes(1);
				expect(permanentListener).toHaveBeenCalledTimes(1);

				const listenersAfterFirstEmit = emitter.listeners(testData.eventNames.testEvent);
				expect(listenersAfterFirstEmit).toHaveLength(1);
				expect(listenersAfterFirstEmit[0]).toBe(permanentListener);

				emitter.emit(testData.eventNames.testEvent, testData.payloads.stringAgain);
				expect(secondOnceListener).toHaveBeenCalledTimes(1);
				expect(firstOnceListener).toHaveBeenCalledTimes(1);
				expect(permanentListener).toHaveBeenCalledTimes(2);
			});
		});
	});

	describe('Edge Cases and Error Handling', () => {
		test('should handle events with no listeners gracefully', () => {
			const emitter = createEmitter<StringEventMap>();

			expect(() => {
				emitter.emit(testData.eventNames.testEvent, testData.payloads.string);
			}).not.toThrow();

			expect(emitter.listenerCount(testData.eventNames.testEvent)).toBe(0);
		});

		test('should handle removing listeners that were never added', () => {
			const emitter = createEmitter<StringEventMap>();
			const neverAddedListener = mock(() => {});

			expect(() => {
				emitter.removeListener(testData.eventNames.testEvent, neverAddedListener);
				emitter.off(testData.eventNames.testEvent, neverAddedListener);
			}).not.toThrow();
		});

		test('should maintain listener order consistency across operations', () => {
			const emitter = createEmitter<StringEventMap>();
			const listeners = Array.from({ length: 5 }, () => mock(() => {}));

			listeners.forEach((listener, index) => {
				if (index % 2 === 0) emitter.addListener(testData.eventNames.testEvent, listener);
				else emitter.prependListener(testData.eventNames.testEvent, listener);
			});

			const currentListeners = emitter.listeners(testData.eventNames.testEvent);
			expect(currentListeners).toHaveLength(5);

			emitter.removeListener(testData.eventNames.testEvent, listeners[1]);
			emitter.removeListener(testData.eventNames.testEvent, listeners[3]);

			const remainingListeners = emitter.listeners(testData.eventNames.testEvent);
			expect(remainingListeners).toHaveLength(3);
			expect(remainingListeners).toContain(listeners[0]);
			expect(remainingListeners).toContain(listeners[2]);
			expect(remainingListeners).toContain(listeners[4]);
		});
	});
});
