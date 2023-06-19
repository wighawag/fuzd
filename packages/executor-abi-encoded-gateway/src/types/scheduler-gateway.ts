import {TransactionSubmission} from 'fuzd-executor';
import {ScheduleInfo, ScheduledExecution} from 'fuzd-scheduler';

export type SignedScheduledExecution<TransactionSubmissionType> = ScheduledExecution<TransactionSubmissionType> & {
	signature: `0x${string}`;
};

export type SchedulerGateway = {
	submitSignedExecution(id: string, execution: SignedScheduledExecution<TransactionSubmission>): Promise<ScheduleInfo>;
};
