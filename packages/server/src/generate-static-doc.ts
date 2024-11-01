// build.ts
import {createDoc} from './index.js';
import {toSSG} from 'hono/ssg';
import fs from 'fs/promises';

toSSG(createDoc(), fs);
