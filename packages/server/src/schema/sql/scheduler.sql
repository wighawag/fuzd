CREATE TABLE IF NOT EXISTS ScheduledExecutions (
    -------------------------------------------------------------------------------------------------------------------
    -- PRIMARY KEY
    -------------------------------------------------------------------------------------------------------------------
    account                       text       NOT NULL,
    chainId                       text       NOT NULL, -- tx chainId
                  slot            text       NOT NULL,
    -------------------------------------------------------------------------------------------------------------------
    broadcasted                   integer    NOT NULL,  -- 0: false 1: true
    nextCheckTime                 integer    NOT NULL,

	type                          text       NOT_NULL, -- 'time-locked' | 'clear';
	payload                       text       NOT_NULL,
	timing                        text       NOT_NULL,
    maxFeePerGas                  text       NOT_NULL,
    paymentReserve                text,

	-- initialTimeTarget                    integer     NOT_NULL,
    priorTransactionConfirmation  text,
	expiry                        integer,
    retries                       integer, 
    
    PRIMARY KEY (account, chainId, slot)
);

CREATE INDEX IF NOT EXISTS idx_ScheduledExecutions_broadcasted_nextCheckTime ON ScheduledExecutions (broadcasted, nextCheckTime);
CREATE INDEX IF NOT EXISTS idx_ScheduledExecutions_account_nextCheckTime ON ScheduledExecutions (account, nextCheckTime);


CREATE TABLE IF NOT EXISTS ArchivedScheduledExecutions (
     -------------------------------------------------------------------------------------------------------------------
    -- PRIMARY KEY
    -------------------------------------------------------------------------------------------------------------------
    account                       text       NOT NULL,
    chainId                       text       NOT NULL, -- tx chainId
                  slot            text       NOT NULL,
    -------------------------------------------------------------------------------------------------------------------
    broadcasted                   integer    NOT NULL,  -- 0: false 1: true
    nextCheckTime                 integer    NOT NULL,

	type                          text       NOT_NULL, -- 'time-locked' | 'clear';
	payload                       text       NOT_NULL,
	timing                        text       NOT_NULL,
    maxFeePerGas                  text       NOT_NULL,
    paymentReserve                text,

	-- initialTimeTarget                    integer     NOT_NULL,
    priorTransactionConfirmation  text,
	expiry                        integer,
    retries                       integer, 
    
    PRIMARY KEY (account, chainId, slot)
);

CREATE INDEX IF NOT EXISTS idx_ArchivedScheduledExecutions_broadcasted_nextCheckTime ON ArchivedScheduledExecutions (broadcasted, nextCheckTime);
CREATE INDEX IF NOT EXISTS idx_ArchivedScheduledExecutions_account_nextCheckTime ON ArchivedScheduledExecutions (account, nextCheckTime);