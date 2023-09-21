import {ScheduleInfo} from 'fuzd-scheduler';

export type SchedulerGateway = {
	submitExecutionAsJsonString(execution: string, signature: `0x${string}`): Promise<ScheduleInfo>;
};
