import {ExecutionSubmission, IntegerString, String0x} from '@fuzd/common';
import {ScheduledExecution} from './external.js';

export type ScheduledExecutionQueued<TransactionDataType> = ScheduledExecution<
	ExecutionSubmission<TransactionDataType>
> & {
	slot: string;
	account: String0x;
	broadcasted: boolean;
	finalized: boolean;
	checkinTime: number;
	retries: number;
	priorTransactionConfirmation?: {
		blockTime: number;
		startTime?: number;
	};
	lastError?: string;
};

export interface SchedulerStorage<TransactionDataType> {
	getQueuedExecution(params: {
		chainId: IntegerString;
		account: String0x;
		slot: string;
	}): Promise<ScheduledExecutionQueued<TransactionDataType> | undefined>;
	getQueuedExecutionsForAccount(params: {
		chainId: IntegerString;
		account: String0x;
	}): Promise<ScheduledExecutionQueued<TransactionDataType>[]>;
	deleteExecution(params: {chainId: IntegerString; account: String0x; slot: string}): Promise<void>;
	archiveExecution(executionToStore: ScheduledExecutionQueued<TransactionDataType>): Promise<void>;
	createOrUpdateQueuedExecution(
		executionToStore: ScheduledExecutionQueued<TransactionDataType>,
	): Promise<ScheduledExecutionQueued<TransactionDataType>>;
	/**
	 * The queued (not yet broadcast) executions with the earliest checkin time first.
	 * `chainId` restricts them to one chain, `upToCheckinTime` to those due at that time.
	 */
	getQueueTopMostExecutions(params: {
		limit: number;
		chainId?: IntegerString;
		upToCheckinTime?: number;
	}): Promise<ScheduledExecutionQueued<TransactionDataType>[]>;
	/**
	 * Claim the due executions of a chain (not broadcast, `checkinTime <= upToCheckinTime`, earliest
	 * first) that no other run holds: in one atomic step, so two runs never get the same one. They stay
	 * the claimant's until it writes them (updateClaimedExecution and archiveClaimedExecution release
	 * them, and so does a new schedule through createOrUpdateQueuedExecution), calls
	 * releaseExecutionClaims, or the claim expires (`claim.expiresAt`, unix ms).
	 *
	 * One account at a time: an account another run still holds an execution of is left out entirely.
	 * The executions of one account share a broadcaster and its nonces, so one run at a time sends
	 * them, in order, and two runs never wait on each other's broadcaster lock. The claimant's own
	 * accounts are not left out, so its next batch carries on with them. Fewer than `limit` means
	 * nothing more is claimable now. See docs/adr/0004-claim-due-items-with-a-lease.md.
	 */
	claimDueExecutions(params: {
		limit: number;
		chainId: IntegerString;
		upToCheckinTime: number;
		claim: {by: string; now: number; expiresAt: number};
	}): Promise<ScheduledExecutionQueued<TransactionDataType>[]>;
	/** Release whatever `claimant` still holds (its run is over). */
	releaseExecutionClaims(claimant: string): Promise<void>;
	/**
	 * Write back an execution `claimant` claimed, and release it: only while `claimant` still holds
	 * the claim. Once its lease expired and another run claimed the execution, or a new schedule
	 * replaced it, or it was archived, nothing is written and this answers false. A run stuck past
	 * its lease can then never undo what happened since (write `broadcasted = false` over another
	 * run's broadcast, or bring an archived execution back). See docs/adr/0004.
	 */
	updateClaimedExecution(
		executionToStore: ScheduledExecutionQueued<TransactionDataType>,
		claimant: string,
	): Promise<boolean>;
	/**
	 * Mark broadcast executions of one chain finalized (what checkScheduledExecutionStatus writes), and
	 * nothing else: only those still broadcast, so that a new schedule written into a slot since it was
	 * read is left as it is. Answers the slots it marked.
	 */
	markExecutionsFinalized(params: {
		chainId: IntegerString;
		slots: {account: String0x; slot: string}[];
	}): Promise<{account: String0x; slot: string}[]>;
	/** archiveExecution, only while `claimant` still holds the claim (see updateClaimedExecution). */
	archiveClaimedExecution(
		executionToStore: ScheduledExecutionQueued<TransactionDataType>,
		claimant: string,
	): Promise<boolean>;
	/**
	 * The oldest broadcast executions not yet finalized, of one chain when `chainId` is given, ordered
	 * by checkin time, account and slot; `after` continues past the last one of a previous page.
	 */
	getUnFinalizedBroadcastedScheduledExecutions(params: {
		limit: number;
		chainId?: IntegerString;
		after?: {checkinTime: number; account: String0x; slot: string};
	}): Promise<ScheduledExecutionQueued<TransactionDataType>[]>;
	getUnFinalizedScheduledExecutionsPerBroadcaster(params: {
		chainId: IntegerString;
		broadcaster: String0x;
		limit: number;
	}): Promise<ScheduledExecutionQueued<TransactionDataType>[]>;
	getAllExecutions(params: {
		limit: number;
		order: 'ASC' | 'DESC';
	}): Promise<ScheduledExecutionQueued<TransactionDataType>[]>;
	getAccountSubmissions(
		account: String0x,
		params: {limit: number},
	): Promise<ScheduledExecutionQueued<TransactionDataType>[]>;
	getAccountArchivedSubmissions(
		account: String0x,
		params: {limit: number},
	): Promise<ScheduledExecutionQueued<TransactionDataType>[]>;
	deleteFinalizedScheduledExecutions(params: {chainId?: IntegerString; upTo?: number}): Promise<void>;
	clear(): Promise<void>;
	setup(): Promise<void>;
}
