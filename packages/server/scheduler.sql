CREATE TABLE IF NOT EXISTS ScheduledExecutions (
    -------------------------------------------------------------------------------------------------------------------
    -- PRIMARY KEY
    -------------------------------------------------------------------------------------------------------------------
    account         text       NOT NULL,
    chainId         text       NOT NULL, -- tx chainId
    slot            text       NOT NULL,
    -------------------------------------------------------------------------------------------------------------------

    nextCheckTime   timestamp  NOT NULL,

	type            text       NOT_NULL, -- 'time-locked' | 'clear';
	payload         text       NOT_NULL,
	timing          text       NOT_NULL,
	-- initialTimeTarget      integer     NOT_NULL,
	expiry          integer,
    retries         integer, 
    
    PRIMARY KEY (account, chainId, slot)
);

CREATE INDEX IF NOT EXISTS idx_ScheduledExecutions_nextCheckTime ON ScheduledExecutions (nextCheckTime);