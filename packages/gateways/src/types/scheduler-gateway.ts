import {ScheduleInfo} from 'fuzd-scheduler';

export type SchedulerGateway = {
	submitExecutionAsJsonString(id: string, execution: string, signature: `0x${string}`): Promise<ScheduleInfo>;
};
