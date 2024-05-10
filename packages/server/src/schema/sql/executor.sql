CREATE TABLE IF NOT EXISTS BroadcastedExecutions (
    -------------------------------------------------------------------------------------------------------------------
    -- PRIMARY KEY
    -------------------------------------------------------------------------------------------------------------------
    account         text       NOT NULL,
    chainId         text       NOT NULL, -- tx chainId
    slot            text       NOT NULL,
    -------------------------------------------------------------------------------------------------------------------

    nextCheckTime          timestamp   NOT NULL,
    broadcasterAssignerID  text        NOT NULL,
    initialTime            timestamp   NOT NULL,
    broadcastTime          timestamp,
    hash                   text        NOT NULL, -- tx hash
    broadcastSchedule      text        NOT NULL,
    isVoidTransaction      integer     NOT NULL,
    retries                integer, 
    lastError              text,
    expiryTime             integer,

    broadcaster            text       NOT NULL, -- tx from
    nonce                  integer    NOT NULL, -- tx nonce

    transactionData        text       NOT NULL, -- 'nonce' | 'maxFeePerGas' | 'maxPriorityFeePerGas' | 'gas' | 'chainId' | 'from' | 'type' | 'accessList' 
    
    PRIMARY KEY (account, chainId, slot)
);
	
CREATE INDEX IF NOT EXISTS idx_BroadcastedExecutions_nextCheckTime ON BroadcastedExecutions (nextCheckTime);
CREATE INDEX IF NOT EXISTS idx_BroadcastedExecutions_tx ON BroadcastedExecutions (broadcaster, chainId, nonce);

CREATE TABLE IF NOT EXISTS Broadcasters (
    -------------------------------------------------------------------------------------------------------------------
    -- PRIMARY KEY
    -------------------------------------------------------------------------------------------------------------------
    address         text       NOT NULL,
    chainId         text       NOT NULL,
    -------------------------------------------------------------------------------------------------------------------

    nextNonce       integer    NOT NULL,

    PRIMARY KEY (address, chainId)
);

-- COULD HAVE USED SAME TABLE ?
CREATE TABLE IF NOT EXISTS ArchivedBroadcastedExecutions (
    -------------------------------------------------------------------------------------------------------------------
    -- PRIMARY KEY
    -------------------------------------------------------------------------------------------------------------------
    account         text       NOT NULL,
    chainId         text       NOT NULL, -- tx chainId
    slot            text       NOT NULL,
    -------------------------------------------------------------------------------------------------------------------

    nextCheckTime          timestamp   NOT NULL,
    broadcasterAssignerID  text        NOT NULL,
    initialTime            timestamp   NOT NULL,
    broadcastTime          timestamp,
    hash                   text        NOT NULL, -- tx hash
    broadcastSchedule      text        NOT NULL,
    isVoidTransaction      integer     NOT NULL,
    retries                integer, 
    lastError              text,
    expiryTime             integer,

    broadcaster            text       NOT NULL, -- tx from
    nonce                  integer    NOT NULL, -- tx nonce

    transactionData        text       NOT NULL, -- 'nonce' | 'maxFeePerGas' | 'maxPriorityFeePerGas' | 'gas' | 'chainId' | 'from' | 'type' | 'accessList' 

    PRIMARY KEY (account, chainId, slot)
);

CREATE INDEX IF NOT EXISTS idx_ArchivedBroadcastedExecutions_initialTime ON ArchivedBroadcastedExecutions (initialTime);

