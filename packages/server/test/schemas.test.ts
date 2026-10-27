import {describe, expect, it} from 'vitest';
import {IndexParamSchema, IntegerStringSchema, String0xSchema} from '../src/schemas/index.js';
import {generateOpenAPIDocument} from '../src/openapi.js';

describe('String0xSchema', () => {
	it('accepts any case and returns lowercase', () => {
		expect(String0xSchema.parse('0xAbCdEF0123')).toBe('0xabcdef0123');
		expect(String0xSchema.parse('0x')).toBe('0x');
	});
	it('rejects what is not 0x-prefixed hex', () => {
		for (const v of ['abcd', '0xZZ', '0X12', ' 0x12', '0x12 ', 12]) {
			expect(String0xSchema.safeParse(v).success).toBe(false);
		}
	});
});

describe('IntegerStringSchema', () => {
	it('accepts a decimal integer without leading zero only', () => {
		expect(IntegerStringSchema.parse('31337')).toBe('31337');
		for (const v of ['0', '01', 'abc1', '1a', '-1', '']) {
			expect(IntegerStringSchema.safeParse(v).success).toBe(false);
		}
	});
});

describe('IndexParamSchema', () => {
	it('turns a decimal string into a number', () => {
		expect(IndexParamSchema.parse('0')).toBe(0);
		expect(IndexParamSchema.parse('12')).toBe(12);
		expect(IndexParamSchema.safeParse('1.5').success).toBe(false);
	});
});

describe('OpenAPI document', () => {
	it('describes the 11 public routes, with request and response schemas', async () => {
		const document = await generateOpenAPIDocument();
		const operations = Object.entries(document.paths).flatMap(([path, item]) =>
			Object.keys(item as object).map((method) => `${method} ${path}`),
		);
		expect(operations.sort()).toEqual(
			[
				'get /api/publicKey',
				'get /api/time/{chainId}',
				'get /api/contractTimestamp',
				'post /api/scheduling/scheduleExecution',
				'get /api/scheduling/reserved/{chainId}/{broadcaster}/{slot}',
				'get /api/scheduling/scheduledExecution/{chainId}/{account}/{slot}',
				'get /api/scheduling/scheduledExecutions/{chainId}/{account}',
				'get /api/execution/remoteAccount/{chainId}/{account}',
				'get /api/execution/paymentRemoteAccount/{chainId}',
				'get /api/execution/execution/{chainId}/{account}/{slot}/{batchIndex}',
				'post /api/execution/broadcastExecution',
			].sort(),
		);
		const schedule = (document.paths['/api/scheduling/scheduleExecution'] as any).post;
		expect(schedule.requestBody.content['application/json'].schema).toBeDefined();
		expect(schedule.responses['200'].content['application/json'].schema).toBeDefined();
	});
});
