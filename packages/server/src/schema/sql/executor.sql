CREATE TABLE IF NOT EXISTS BroadcastedExecutions (
    -------------------------------------------------------------------------------------------------------------------
    -- PRIMARY KEY
    -------------------------------------------------------------------------------------------------------------------
    account         text       NOT NULL,
    chainId         text       NOT NULL, -- tx chainId
    slot            text       NOT NULL,
    batchIndex      number     NOT NULL,
    -------------------------------------------------------------------------------------------------------------------
    serviceParameters          text        NOT NULL,
    onBehalf                   text,
    nextCheckTime              integer     NOT NULL,
    initialTime                integer     NOT NULL,
    bestTime                   integer,
    broadcastTime              integer,
    hash                       text        NOT NULL, -- tx hash
    maxFeePerGasAuthorized     text        NOT NULL,
    helpedForUpToGasPrice      text,
    isVoidTransaction          integer     NOT NULL,
    retries                    integer, 
    lastError                  text,
    expiryTime                 integer,
    finalized                  integer     NOT NULL, -- 0: false, 1: true

    broadcaster                text        NOT NULL, -- tx from
    nonce                      text        NOT NULL, -- tx nonce
    transactionParametersUsed  text        NOT NULL, -- tx maxFeePerGas,maxPriorityFeePerGas

    transactionData            text        NOT NULL, -- 'nonce' | 'maxFeePerGas' | 'maxPriorityFeePerGas' | 'gas' | 'chainId' | 'from' | 'type' | 'accessList' 
    
    PRIMARY KEY (account, chainId, slot, batchIndex)
);
	
CREATE INDEX IF NOT EXISTS idx_BroadcastedExecutions_finalized_nextCheckTime ON BroadcastedExecutions (finalized, nextCheckTime);
CREATE INDEX IF NOT EXISTS idx_BroadcastedExecutions_tx ON BroadcastedExecutions (broadcaster, chainId, nonce);
CREATE INDEX IF NOT EXISTS idx_BroadcastedExecutions_onBehalf_chainId_nonce ON BroadcastedExecutions (onBehalf, chainId, nonce);


CREATE TABLE IF NOT EXISTS Broadcasters (
    -------------------------------------------------------------------------------------------------------------------
    -- PRIMARY KEY
    -------------------------------------------------------------------------------------------------------------------
    address         text       NOT NULL,
    chainId         text       NOT NULL,
    -------------------------------------------------------------------------------------------------------------------

    nextNonce       integer    NOT NULL,
    lock            text,
    lock_timestamp  integer,

    debtInUnit      text       NOT NULL,

    PRIMARY KEY (address, chainId)
);


CREATE TABLE IF NOT EXISTS ChainConfigurations (
    -------------------------------------------------------------------------------------------------------------------
    -- PRIMARY KEY
    -------------------------------------------------------------------------------------------------------------------
    chainId                   text       NOT NULL,
    -------------------------------------------------------------------------------------------------------------------

    expectedGasPrice_current  text,
    expectedGasPrice_previous text,
    expectedGasPrice_update   integer,

    fees_current              text,
    fees_previous             text,
    fees_update               integer,


    PRIMARY KEY (chainId)
);

