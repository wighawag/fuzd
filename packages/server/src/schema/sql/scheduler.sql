CREATE TABLE IF NOT EXISTS ScheduledExecutions (
    -------------------------------------------------------------------------------------------------------------------
    -- PRIMARY KEY
    -------------------------------------------------------------------------------------------------------------------
    account                       text       NOT NULL,
    chainId                       text       NOT NULL, -- tx chainId
    slot                          text       NOT NULL,
    -------------------------------------------------------------------------------------------------------------------
    onBehalf                      text,
    broadcastStatus               integer,             -- 0 : not broadcasted, 1: broadcasted, 2: finalized
    nextCheckTime                 integer    NOT NULL,

	type                          text       NOT_NULL, -- 'time-locked' | 'clear';
	payload                       text       NOT_NULL,
	timing                        text       NOT_NULL,
    expectedWorstCaseGasPrice     text       NOT_NULL,
    paymentReserve                text,

	-- initialTimeTarget                    integer     NOT_NULL,
    priorTransactionConfirmation  text,
	expiry                        integer,
    retries                       integer, 
    
    PRIMARY KEY (account, chainId, slot)
);

CREATE INDEX IF NOT EXISTS idx_ScheduledExecutions_broadcastStatus_nextCheckTime ON ScheduledExecutions (broadcastStatus, nextCheckTime);
CREATE INDEX IF NOT EXISTS idx_ScheduledExecutions_account_nextCheckTime ON ScheduledExecutions (account, nextCheckTime);
CREATE INDEX IF NOT EXISTS idx_ScheduledExecutions_onBehalf_broadcastStatus ON ScheduledExecutions (onBehalf, broadcastStatus);


CREATE TABLE IF NOT EXISTS ArchivedScheduledExecutions (
     -------------------------------------------------------------------------------------------------------------------
    -- PRIMARY KEY
    -------------------------------------------------------------------------------------------------------------------
    account                       text       NOT NULL,
    chainId                       text       NOT NULL, -- tx chainId
    slot                          text       NOT NULL,
    -------------------------------------------------------------------------------------------------------------------
    onBehalf                      text,
    broadcastStatus                   integer,
    nextCheckTime                 integer    NOT NULL,

	type                          text       NOT_NULL, -- 'time-locked' | 'clear';
	payload                       text       NOT_NULL,
	timing                        text       NOT_NULL,
    expectedWorstCaseGasPrice     text,
    paymentReserve                text,

	-- initialTimeTarget                    integer     NOT_NULL,
    priorTransactionConfirmation  text,
	expiry                        integer,
    retries                       integer, 
    
    PRIMARY KEY (account, chainId, slot)
);

CREATE INDEX IF NOT EXISTS idx_ArchivedScheduledExecutions_broadcastStatus_nextCheckTime ON ArchivedScheduledExecutions (broadcastStatus, nextCheckTime);
CREATE INDEX IF NOT EXISTS idx_ArchivedScheduledExecutions_account_nextCheckTime ON ArchivedScheduledExecutions (account, nextCheckTime);
CREATE INDEX IF NOT EXISTS idx_ArchivedScheduledExecutions_onBehalf_broadcastStatus ON ArchivedScheduledExecutions (onBehalf, broadcastStatus);