import {UpdateableParameters} from '../types/index.js';

export function validateParameters<T extends Record<string, any>>(
	parameters: T,
	allowedParameters: UpdateableParameters<T>,
	timestamp: number,
	allowedDelay: number = 60 * 24,
): boolean {
	// Iterate through each key in the parameters object
	for (const key in parameters) {
		if (Object.prototype.hasOwnProperty.call(parameters, key)) {
			const param = parameters[key as keyof T];
			const allowedParam = allowedParameters[key as keyof T];

			// Check if the parameter is defined in allowedParameters
			if (!allowedParam) {
				return false;
			}

			// Check if the parameter matches the current value
			if (JSON.stringify(param) === JSON.stringify(allowedParam.current)) {
				continue;
			}

			// Check if the parameter matches the previous value and is within the valid time range
			if (
				allowedParam.previous !== undefined &&
				JSON.stringify(param) === JSON.stringify(allowedParam.previous) &&
				timestamp < allowedParam.updateTimestamp + allowedDelay
			) {
				continue;
			}

			// If the parameter doesn't match current or previous (within time range), return false
			return false;
		}
	}

	// All parameters are valid
	return true;
}
