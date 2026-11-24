/**
 * Encodes a counter as the 8-byte big-endian value HOTP signs (RFC 4226).
 *
 * @param counter - The counter value, a number is floored first.
 *
 * @returns An 8-byte buffer holding the counter.
 */
export const createCounterBuffer = (counter: number | bigint): ArrayBuffer => {
	const counterBuffer = new ArrayBuffer(8);
	const counterView = new DataView(counterBuffer);
	const counterBigInt = typeof counter === 'bigint' ? counter : BigInt(Math.floor(counter));
	counterView.setBigUint64(0, counterBigInt, false);
	return counterBuffer;
};
