import 'dotenv/config'; 

export function apiKeyGuard(req, res, next) {
    const apiKey = req.headers['x-api-key'];

    const expectedKey = process.env.SERVICE_API_KEY; 

    if (!apiKey || apiKey !== expectedKey) {
        console.warn('Access denied: Invalid or missing API Key.');
        return res.status(403).json({
            error: "Forbidden",
            message: "Access Denied: Invalid or missing API Key."
        });
    }
    next();
}