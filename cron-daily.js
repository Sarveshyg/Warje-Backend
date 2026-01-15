import { supabase } from "./supabase.js";

export default async function handler(req, res) {
    // 1. Security Check
    if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ message: 'Unauthorized: Invalid cron secret.' });
    }

    try {
        const nowUTC = new Date();
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30); // Calculate date for 30 days ago

        const logResults = {};

        // ==================================================
        // TASK 1: Cleanup Expired OTPs (Temp Users)
        // ==================================================
        const { count: otpCount, error: otpError } = await supabase
            .from("temp_users_otp") // Make sure this table name matches your DB
            .delete({ count: 'exact' })
            .lt("expiry_time", nowUTC.toISOString());

        if (otpError) throw new Error(`OTP Cleanup Failed: ${otpError.message}`);
        logResults.deleted_otps = otpCount;

        // ==================================================
        // TASK 2: Hard Delete Users (Soft Deleted > 30 Days)
        // ==================================================
        // Note: Due to foreign keys, ensure you have 'ON DELETE CASCADE' set up in your DB 
        // or delete dependent data first.
        const { count: userCount, error: userError } = await supabase
            .from("users")
            .delete({ count: 'exact' })
            .eq("is_deleted", true)
            .lt("deleted_at", thirtyDaysAgo.toISOString());

        if (userError) throw new Error(`User Cleanup Failed: ${userError.message}`);
        logResults.deleted_users = userCount;

        // ==================================================
        // TASK 3: Hard Delete Cases (Soft Deleted > 30 Days)
        // ==================================================
        const { count: caseCount, error: caseError } = await supabase
            .from("cases")
            .delete({ count: 'exact' })
            .eq("is_deleted", true)
            .lt("deleted_at", thirtyDaysAgo.toISOString());

        if (caseError) throw new Error(`Case Cleanup Failed: ${caseError.message}`);
        logResults.deleted_cases = caseCount;

        // ==================================================
        // TASK 4: Increment Stage for All Active Cases
        // ==================================================
        // We call the RPC function we created in Step 1
        const { error: rpcError } = await supabase
            .rpc('increment_all_case_stages');

        if (rpcError) throw new Error(`Stage Increment Failed: ${rpcError.message}`);
        logResults.stage_incremented = "Success";

        // ==================================================
        // SUCCESS RESPONSE
        // ==================================================
        console.log("Daily Maintenance Complete:", logResults);
        
        return res.status(200).json({ 
            message: "Daily maintenance tasks completed successfully.", 
            results: logResults 
        });

    } catch (error) {
        console.error("Cron Job Failed:", error);
        return res.status(500).json({ 
            message: "Internal server error during maintenance.",
            error: error.message 
        });
    }
}