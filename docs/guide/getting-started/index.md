---
outline: deep
---

::: warning

Both the documentation and the api are work in progress

If anything feels wrong, do not hesitate to provide your feedback on our github repo: https://github.com/wighawag/fuzd/ so we can improve before first release

:::

# FUZD

## FUZD packages

FUZD is built as a set of packages:

### fuzd-scheduler

This is the package that perform the delayed execution and decrypt the payload when possible. It then defers execution to an execution api

### fuzd-executor

This is a execution api provided as part of FUZD, that make use of a very simple mechanism to perform execution on behalf of ethereum account

### fuzd-common

This is a commin library used by the other fuzd-packages

### fuzd-tlock-decrypter

This package allow to accept [Drand](https://drand.love/) encrypted payload and decrypt them as transaction to be executed

### fuzd-server

An api server built on [Hono](https://hono.dev/) that use fuzd-scheduler and fuzd-executor to schedule and execute on behalf of users

### fuzd-chain-protocol

An abstraction layer so that fuzd can easily support any network. It currently support

- any evm network that follow ethereum rpc spec
- starknet

### fuzd-client

A simple client, that also contains a cli to schedule execution from the command line

## FUZD platforms

FUZD can run on any platform that support javascript. FUZD aims to provide basic setup for some

### fuzd-cf-worker

This package wrap `fuzd-server` into a cloudflare worker, ready to be deployed, using D1 as database
