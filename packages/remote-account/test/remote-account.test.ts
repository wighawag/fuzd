import * as bip39 from '@scure/bip39';
import {HDKey} from '@scure/bip32';
import {deriveRemoteAddress, initKeyFromHD} from '../src/index';

const defaultPath = "m/44'/60'/0'/0/0";
const seed = bip39.mnemonicToSeedSync('test test test test test test test test test test test junk');
const hdkey = HDKey.fromMasterSeed(seed);
const account = hdkey.derive(defaultPath);

const address = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const derivedKey = initKeyFromHD(account).deriveForAddress(address);
console.log(derivedKey.address);
console.log(deriveRemoteAddress(account.publicExtendedKey, address));
