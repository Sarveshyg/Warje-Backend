import jwt from 'jsonwebtoken';
import 'dotenv/config';
import { supabase } from "../config/supabase.js";

export async function verifyToken(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authentication failed: No token provided' });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        if (!decoded.user_id) {
            console.error('JWT Error: Missing user_id in payload');
            return res.status(401).json({ error: 'Authentication failed: Invalid token structure' });
        }

        const { data: user, error: userError } = await supabase
            .from("users")
            .select("user_id, role, is_deleted")
            .eq("user_id", decoded.user_id)
            .maybeSingle();

        if (userError) {
            console.error("DB Verification Error:", userError);
            return res.status(500).json({ error: "Internal server error during auth check" });
        }

        if (!user) {
            return res.status(401).json({ error: "Authentication failed: User no longer exists." });
        }

        if (user.is_deleted) {
            return res.status(403).json({ error: "Account deactivated. Please contact admin." });
        }

        req.user = { ...decoded, ...user };
        req.token = token;

        next();

    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Session expired. Please log in again.' });
        }
        if (error.name === 'JsonWebTokenError') {
            return res.status(403).json({ error: 'Invalid token.' });
        }

        console.error("Verify Token General Error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
}

export default {
    verifyToken
};