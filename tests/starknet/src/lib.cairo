use core::starknet::ContractAddress;

#[starknet::interface]
trait IGreetingsRegistry<ContractState> {
    // READS
    fn messages(self: @ContractState, user: ContractAddress) -> GreetingsRegistry::Message;
    fn lastGreetingOf(self: @ContractState, user: ContractAddress) -> felt252;
    fn prefix(self: @ContractState) -> felt252;
    fn isDelegate(self: @ContractState, account: ContractAddress, delegated: ContractAddress) -> bool;

    // WRITES
    fn setMessage(ref self: ContractState, message: felt252, dayTimeInSeconds: u32);
    fn setMessageFor(ref self: ContractState, account: ContractAddress, message: felt252, dayTimeInSeconds: u32);
    fn delegate(ref self: ContractState, to: ContractAddress, yes: bool);

}

#[starknet::contract]
mod GreetingsRegistry {
    use core::starknet::storage::{
        Map, StoragePathEntry, StoragePointerReadAccess, StoragePointerWriteAccess
    };
    use starknet::{get_caller_address};
    use core::starknet::ContractAddress;
   

    // --------------------------------------------------------------------------------------------
    // STORAGE
    // --------------------------------------------------------------------------------------------
    #[derive(Drop, Serde, starknet::Store)]
    pub struct Message {
        content: felt252,
        timestamp: felt252,
        dayTimeInSeconds: u32
    }
    
    #[storage]
    struct Storage {
        prefix: felt252,
        messages: Map<ContractAddress, Message>,
        delegates: Map<ContractAddress, Map<ContractAddress, bool>>,
    }
    // --------------------------------------------------------------------------------------------

    // --------------------------------------------------------------------------------------------
    // EVENTS
    // --------------------------------------------------------------------------------------------
    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        MessageChanged: MessageChanged,
        Delegated: Delegated,
    }

    /// @notice Emitted when a greetings is created/updated
    #[derive(Drop, starknet::Event)]
    struct MessageChanged {
        // address indexed user, uint256 timestamp, string message, uint24 dayTimeInSeconds
        #[key]
        user: ContractAddress,
        timestamp: felt252,
        message: felt252,
        dayTimeInSeconds: u32,
    }

    /// @notice Emitted when an account delegate to another
    #[derive(Drop, starknet::Event)]
    struct Delegated {
        //address indexed user, address indexed delegated, bool yes
        user: ContractAddress,
        delegated: ContractAddress,
        yes: bool,
    }
    // --------------------------------------------------------------------------------------------

    
    // --------------------------------------------------------------------------------------------
    // ERRORS
    // --------------------------------------------------------------------------------------------
    pub mod Errors {
        pub const UNAUTHORIZED: felt252 = 'messages/unauthorized';
    }
    // --------------------------------------------------------------------------------------------

    // --------------------------------------------------------------------------------------------
    // CONSTRUCTOR
    // --------------------------------------------------------------------------------------------
    #[constructor]
    fn constructor(ref self: ContractState, prefix: felt252) {
        self.prefix.write(prefix);
    }
    // --------------------------------------------------------------------------------------------

    // --------------------------------------------------------------------------------------------
    // INTERFACE
    // --------------------------------------------------------------------------------------------
    #[abi(embed_v0)]
    impl GreetingsRegistryImpl of super::IGreetingsRegistry<ContractState> {

        // ----------------------------------------------------------------------------------------
        // READS
        // ----------------------------------------------------------------------------------------
        fn messages(self: @ContractState, user: ContractAddress) -> Message {
            self.messages.entry(user).read()
        }
        fn lastGreetingOf(self: @ContractState, user: ContractAddress) -> felt252 {
            self.messages.entry(user).read().content
        }
        fn prefix(self: @ContractState) -> felt252 {
            self.prefix.read()
        }
        fn isDelegate(self: @ContractState, account: ContractAddress, delegated: ContractAddress) -> bool {
            self.delegates.entry(account).entry(delegated).read()
        }
        // ----------------------------------------------------------------------------------------

        // ----------------------------------------------------------------------------------------
        // WRITES
        // ----------------------------------------------------------------------------------------
        fn setMessage(ref self: ContractState, message: felt252, dayTimeInSeconds: u32) {
            let sender = get_caller_address();
            self._setMessageFor(sender, message, dayTimeInSeconds)
        }
        fn setMessageFor(ref self: ContractState, account: ContractAddress, message: felt252, dayTimeInSeconds: u32) {
            let sender = get_caller_address();
            assert( self.delegates.entry(account).entry(sender).read(),  Errors::UNAUTHORIZED);
            self._setMessageFor(account, message, dayTimeInSeconds)
        }
        fn delegate(ref self: ContractState, to: ContractAddress, yes: bool) {
            // TODO 	to.transfer(msg.value)
            let sender = get_caller_address();
            self.delegates.entry(sender).entry(to).write(yes);
            self.emit(Delegated { user: sender, delegated: to, yes: yes });
        }
        // ----------------------------------------------------------------------------------------
    }
    // ----------------------------------------------------------------------------------------

    // --------------------------------------------------------------------------------------------
    // INTERNAL
    // --------------------------------------------------------------------------------------------
    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn _setMessageFor(ref self: ContractState, account: ContractAddress, message: felt252, dayTimeInSeconds: u32) {
            // TODO string memory actualMessage = string(bytes.concat(bytes(_prefix), bytes(message)));
            let actual_message = message;
            let timestamp = 1; // TODO
            self.messages.entry(account).write(Message {
                content: actual_message,
                timestamp: timestamp,
                dayTimeInSeconds: dayTimeInSeconds
            });
            self.emit(MessageChanged { user: account, timestamp: timestamp, dayTimeInSeconds: dayTimeInSeconds, message: actual_message });
        }
    }
    // ----------------------------------------------------------------------------------------
}

