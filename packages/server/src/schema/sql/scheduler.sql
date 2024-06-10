CREATE TABLE IF NOT EXISTS ScheduledExecutions (
    -------------------------------------------------------------------------------------------------------------------
    -- PRIMARY KEY
    -------------------------------------------------------------------------------------------------------------------
    account                       text       NOT NULL,
    chainId                       text       NOT NULL, -- tx chainId
    slot                          text       NOT NULL,
    -------------------------------------------------------------------------------------------------------------------
    onBehalf                      text,
    broadcasted                   integer,             -- 0 : FALSE, 1 : TRUE
    finalized                     integer,             -- 0 : FALSE, 1 : TRUE
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

CREATE INDEX IF NOT EXISTS idx_ScheduledExecutions_broadcasted_nextCheckTime ON ScheduledExecutions (broadcasted, nextCheckTime);
CREATE INDEX IF NOT EXISTS idx_ScheduledExecutions_chainId_account_finalized_nextCheckTime ON ScheduledExecutions (chainId, account, finalized, nextCheckTime);
CREATE INDEX IF NOT EXISTS idx_ScheduledExecutions_broadcasted_finalized_nextCheckTime ON ScheduledExecutions (broadcasted, finalized, nextCheckTime);

CREATE INDEX IF NOT EXISTS idx_ScheduledExecutions_account_nextCheckTime ON ScheduledExecutions (account, nextCheckTime);
CREATE INDEX IF NOT EXISTS idx_ScheduledExecutions_onBehalf_broadcasted ON ScheduledExecutions (onBehalf, broadcasted);


CREATE TABLE IF NOT EXISTS ArchivedScheduledExecutions (
     -------------------------------------------------------------------------------------------------------------------
    -- PRIMARY KEY
    -------------------------------------------------------------------------------------------------------------------
    account                       text       NOT NULL,
    chainId                       text       NOT NULL, -- tx chainId
    slot                          text       NOT NULL,
    -------------------------------------------------------------------------------------------------------------------
    onBehalf                      text,
    broadcasted                   integer,             -- 0 : FALSE, 1 : TRUE
    finalized                     integer,             -- 0 : FALSE, 1 : TRUE
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

CREATE INDEX IF NOT EXISTS idx_ArchivedScheduledExecutions_broadcasted_nextCheckTime ON ArchivedScheduledExecutions (broadcasted, nextCheckTime);
CREATE INDEX IF NOT EXISTS idx_ArchivedScheduledExecutions_chainId_account_finalized_nextCheckTime ON ArchivedScheduledExecutions (chainId, account, finalized, nextCheckTime);
CREATE INDEX IF NOT EXISTS idx_ArchivedScheduledExecutions_broadcasted_finalized_nextCheckTime ON ArchivedScheduledExecutions (broadcasted, finalized, nextCheckTime);

CREATE INDEX IF NOT EXISTS idx_ArchivedScheduledExecutions_account_nextCheckTime ON ArchivedScheduledExecutions (account, nextCheckTime);
CREATE INDEX IF NOT EXISTS idx_ArchivedScheduledExecutions_onBehalf_broadcasted ON ArchivedScheduledExecutions (onBehalf, broadcasted);
