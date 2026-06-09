import { t } from 'elysia';

export const rateLimitContract = {
	409: t.Object({
		message: t.String({
			description: 'Error message indicating that the rate limit has been exceeded.'
		})
	})
};
