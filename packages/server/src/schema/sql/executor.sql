CREATE TABLE IF NOT EXISTS BroadcastedExecutions (
    -------------------------------------------------------------------------------------------------------------------
    -- PRIMARY KEY
    -------------------------------------------------------------------------------------------------------------------
    account         text       NOT NULL,
    chainId         text       NOT NULL, -- tx chainId
    slot            text       NOT NULL,
    -------------------------------------------------------------------------------------------------------------------

    nextCheckTime          integer     NOT NULL,
    broadcasterAssignerID  text        NOT NULL,
    initialTime            integer     NOT NULL,
    broadcastTime          integer,
    hash                   text        NOT NULL, -- tx hash
    maxFeePerGasAuthorized text        NOT NULL,
    isVoidTransaction      integer     NOT NULL,
    retries                integer, 
    lastError              text,
    expiryTime             integer,
    finalized              integer     NOT NULL, -- 0: false, 1: true

    broadcaster            text        NOT NULL, -- tx from
    nonce                  integer     NOT NULL, -- tx nonce

    transactionData        text        NOT NULL, -- 'nonce' | 'maxFeePerGas' | 'maxPriorityFeePerGas' | 'gas' | 'chainId' | 'from' | 'type' | 'accessList' 
    
    PRIMARY KEY (account, chainId, slot)
);
	
CREATE INDEX IF NOT EXISTS idx_BroadcastedExecutions_finalized_nextCheckTime ON BroadcastedExecutions (finalized, nextCheckTime);
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


CREATE TABLE IF NOT EXISTS ChainConfigurations (
    -------------------------------------------------------------------------------------------------------------------
    -- PRIMARY KEY
    -------------------------------------------------------------------------------------------------------------------
    chainId                   text       NOT NULL,
    -------------------------------------------------------------------------------------------------------------------

    currentExpectedGasPrice   text,
    previousExpectedGasPrice  text,
    expectedGasPriceUpdate    integer,


    PRIMARY KEY (chainId)
);


