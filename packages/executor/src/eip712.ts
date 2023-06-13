type DomainField =
	| {name: 'name'; type: 'string'}
	| {name: 'version'; type: 'string'}
	| {name: 'chainId'; type: 'uint256'}
	| {name: 'verifyingContract'; type: 'address'}
	| {name: 'salt'; type: 'bytes32'};

type GenericTypes = {[typeName: string]: TypeField[]};
type TypeField<T extends GenericTypes = GenericTypes> = {
	name: string;
	type: keyof T | 'string' | 'uint256' | 'bytes32';
};
type Types<T extends GenericTypes = GenericTypes> = Omit<{[typeName: string]: TypeField<T>[]}, 'EIP712Domain'>;
type TypedData<T extends GenericTypes = GenericTypes> = {
	types: Types<T> & {
		EIP712Domain: DomainField[];
	};
	primaryType: keyof T;
	domain: Partial<{[key in DomainField['name']]: any}>; // TODO fix
	message: {[key in keyof T['name']]: any}; // TODO fix
};

type ExcutionTypes = {
	Execution: [{name: 'AName'; type: 'Execution'}];
};
const payload: TypedData<ExcutionTypes> = {
	types: {
		EIP712Domain: [{name: 'name', type: 'string'}],
		Execution: [{name: 'v', type: 'uint256'}],
	},
	primaryType: 'Execution',
	domain: {
		name: 'Executor',
	},
	message: {
		v: 'dd',
	},
};
