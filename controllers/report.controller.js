import { supabase } from "../config/supabase.js";
import { CASE_PRIORITY, CASE_STATUS, STATUS } from "../utils/constants.js";
import { successResponseBody, errorResponseBody } from "../utils/responseBody.js";

const createReport = async (req, res) => {
    try {
        const { report_number, title, priority, deadline, assigned_officer_emails } = req.body;

        // Check if report_number already exists
        const { data: existingReport, error: checkError } = await supabase
            .from("reports")
            .select("report_id")
            .eq("report_number", report_number)
            .maybeSingle();

        if (checkError) throw checkError;

        if (existingReport) {
            const response = { ...errorResponseBody };
            response.message = "Report number already exists.";
            response.err = { report_number: `A report with number '${report_number}' already exists.` };
            return res.status(STATUS.CONFLICT || 409).json(response);
        }

        // Verify all officer emails exist
        const { data: officers, error: officerError } = await supabase
            .from("users")
            .select("user_id, email_id")
            .in("email_id", assigned_officer_emails)
            .eq("is_deleted", false);

        if (officerError) throw officerError;

        const foundEmails = officers.map(o => o.email_id);
        const notFoundEmails = assigned_officer_emails.filter(email => !foundEmails.includes(email));

        if (notFoundEmails.length > 0) {
            const response = { ...errorResponseBody };
            response.message = "Some officer emails were not found.";
            response.err = { not_found_emails: notFoundEmails };
            return res.status(STATUS.NOT_FOUND).json(response);
        }

        // Create the report
        const newReport = {
            report_number,
            title,
            priority: priority || CASE_PRIORITY.MEDIUM,
            deadline: deadline || null,
            status: CASE_STATUS.PENDING,
            stage: 1
        };

        const { data: createdReport, error: insertError } = await supabase
            .from("reports")
            .insert(newReport)
            .select()
            .single();

        if (insertError) throw insertError;

        // Create report_users entries
        const reportUserEntries = officers.map(officer => ({
            report_id: createdReport.report_id,
            user_id: officer.user_id
        }));

        const { error: reportUsersError } = await supabase
            .from("report_users")
            .insert(reportUserEntries);

        if (reportUsersError) throw reportUsersError;

        const response = { ...successResponseBody };
        response.message = "Report created successfully.";
        response.body = {
            report: createdReport,
            assigned_officers: officers.map(o => ({ user_id: o.user_id, email_id: o.email_id }))
        };

        return res.status(STATUS.CREATED).json(response);

    } catch (error) {
        console.error("Create Report Error:", error);

        if (error.code === '23505') {
            const response = { ...errorResponseBody };
            response.message = "Report number already exists.";
            response.err = { report_number: "Duplicate report number." };
            return res.status(STATUS.CONFLICT || 409).json(response);
        }

        const response = { ...errorResponseBody };
        response.message = "Failed to create report.";
        response.err = { details: error.message };
        return res.status(STATUS.INTERNAL_SERVER_ERROR).json(response);
    }
};

const getReport = async (req, res) => {
    try {
        const reportNumber = req.targetReportNumber;

        if (reportNumber) {
            // Get specific report by report_number
            const { data: report, error } = await supabase
                .from("reports")
                .select("*")
                .eq("report_number", reportNumber)
                .eq("is_deleted", false)
                .maybeSingle();

            if (error) throw error;

            if (!report) {
                const response = { ...errorResponseBody };
                response.message = "Report not found.";
                response.err = { report_number: `No report found with number '${reportNumber}'.` };
                return res.status(STATUS.NOT_FOUND).json(response);
            }

            // Get assigned officers
            const { data: officers, error: officerError } = await supabase
                .from("report_users")
                .select("user_id, users(user_id, name, email_id, rank)")
                .eq("report_id", report.report_id);

            if (officerError) throw officerError;

            const response = { ...successResponseBody };
            response.message = "Report fetched successfully.";
            response.body = {
                report,
                assigned_officers: officers.map(o => o.users)
            };
            return res.status(STATUS.OK).json(response);

        } else {
            // Get all reports
            const { data: reports, error } = await supabase
                .from("reports")
                .select("*")
                .eq("is_deleted", false)
                .order("created_at", { ascending: false });

            if (error) throw error;

            const response = { ...successResponseBody };
            response.message = "Reports fetched successfully.";
            response.body = reports;
            return res.status(STATUS.OK).json(response);
        }

    } catch (error) {
        console.error("Get Report Error:", error);
        const response = { ...errorResponseBody };
        response.message = "Failed to fetch reports.";
        response.err = { details: error.message };
        return res.status(STATUS.INTERNAL_SERVER_ERROR).json(response);
    }
};

const getReportByUserId = async (req, res) => {
    try {
        const userId = req.params.user_id;

        // Get report_ids for this user
        const { data: reportUsers, error: ruError } = await supabase
            .from("report_users")
            .select("report_id")
            .eq("user_id", userId);

        if (ruError) throw ruError;

        if (!reportUsers || reportUsers.length === 0) {
            const response = { ...successResponseBody };
            response.message = "No reports found for this officer.";
            response.body = [];
            return res.status(STATUS.OK).json(response);
        }

        const reportIds = reportUsers.map(ru => ru.report_id);

        const { data: reports, error } = await supabase
            .from("reports")
            .select("*")
            .in("report_id", reportIds)
            .eq("is_deleted", false)
            .order("created_at", { ascending: false });

        if (error) throw error;

        const response = { ...successResponseBody };
        response.message = "Reports fetched successfully.";
        response.body = reports;
        return res.status(STATUS.OK).json(response);

    } catch (error) {
        console.error("Get Report By User ID Error:", error);
        const response = { ...errorResponseBody };
        response.message = "Failed to fetch reports.";
        response.err = { details: error.message };
        return res.status(STATUS.INTERNAL_SERVER_ERROR).json(response);
    }
};

const getReportByEmailId = async (req, res) => {
    try {
        const { email_id } = req.body;

        const { data: user, error: userError } = await supabase
            .from("users")
            .select("user_id")
            .eq("email_id", email_id)
            .eq("is_deleted", false)
            .maybeSingle();

        if (userError) throw userError;

        if (!user) {
            const response = { ...errorResponseBody };
            response.message = "User not found.";
            response.err = { email_id: "No user found with this email." };
            return res.status(STATUS.NOT_FOUND).json(response);
        }

        const { data: reportUsers, error: ruError } = await supabase
            .from("report_users")
            .select("report_id")
            .eq("user_id", user.user_id);

        if (ruError) throw ruError;

        if (!reportUsers || reportUsers.length === 0) {
            const response = { ...successResponseBody };
            response.message = "No reports found for this officer.";
            response.body = [];
            return res.status(STATUS.OK).json(response);
        }

        const reportIds = reportUsers.map(ru => ru.report_id);

        const { data: reports, error } = await supabase
            .from("reports")
            .select("*")
            .in("report_id", reportIds)
            .eq("is_deleted", false)
            .order("created_at", { ascending: false });

        if (error) throw error;

        const response = { ...successResponseBody };
        response.message = "Reports fetched successfully.";
        response.body = reports;
        return res.status(STATUS.OK).json(response);

    } catch (error) {
        console.error("Get Report By Email Error:", error);
        const response = { ...errorResponseBody };
        response.message = "Failed to fetch reports.";
        response.err = { details: error.message };
        return res.status(STATUS.INTERNAL_SERVER_ERROR).json(response);
    }
};

const getOfficersReportsCount = async (req, res) => {
    try {
        const userId = req.query.user_id || req.user.user_id;
        const status = req.query.status;

        // Get report_ids for this user
        const { data: reportUsers, error: ruError } = await supabase
            .from("report_users")
            .select("report_id")
            .eq("user_id", userId);

        if (ruError) throw ruError;

        if (!reportUsers || reportUsers.length === 0) {
            const response = { ...successResponseBody };
            response.message = "Report count fetched.";
            response.body = { count: 0 };
            return res.status(STATUS.OK).json(response);
        }

        const reportIds = reportUsers.map(ru => ru.report_id);

        let query = supabase
            .from("reports")
            .select("report_id", { count: "exact", head: true })
            .in("report_id", reportIds)
            .eq("is_deleted", false);

        if (status) {
            query = query.eq("status", status);
        }

        const { count, error } = await query;

        if (error) throw error;

        const response = { ...successResponseBody };
        response.message = "Report count fetched.";
        response.body = { count };
        return res.status(STATUS.OK).json(response);

    } catch (error) {
        console.error("Get Report Count Error:", error);
        const response = { ...errorResponseBody };
        response.message = "Failed to get report count.";
        response.err = { details: error.message };
        return res.status(STATUS.INTERNAL_SERVER_ERROR).json(response);
    }
};

const updateReport = async (req, res) => {
    try {
        const updates = req.validReportUpdates;
        const reportId = req.targetReportId;
        const reportNumber = req.targetReportNumber;
        const assignedOfficers = req.validAssignedOfficers;
        const isAdmin = req.isAdmin;

        // Update report fields
        if (Object.keys(updates).length > 0) {
            updates.updated_at = new Date().toISOString();

            const { error: updateError } = await supabase
                .from("reports")
                .update(updates)
                .eq("report_id", reportId);

            if (updateError) throw updateError;
        }

        // Update officer assignments if provided
        if (assignedOfficers) {
            // Remove old assignments
            const { error: deleteError } = await supabase
                .from("report_users")
                .delete()
                .eq("report_id", reportId);

            if (deleteError) throw deleteError;

            // Insert new assignments
            const newAssignments = assignedOfficers.map(user_id => ({
                report_id: reportId,
                user_id
            }));

            const { error: insertError } = await supabase
                .from("report_users")
                .insert(newAssignments);

            if (insertError) throw insertError;
        }

        // Fetch updated report
        const { data: updatedReport, error: fetchError } = await supabase
            .from("reports")
            .select("*")
            .eq("report_id", reportId)
            .single();

        if (fetchError) throw fetchError;

        // Fetch assigned officers
        const { data: officers, error: officerError } = await supabase
            .from("report_users")
            .select("user_id, users(user_id, name, email_id, rank)")
            .eq("report_id", reportId);

        if (officerError) throw officerError;

        const response = { ...successResponseBody };
        response.message = "Report updated successfully.";
        response.body = {
            report: updatedReport,
            assigned_officers: officers.map(o => o.users)
        };
        return res.status(STATUS.OK).json(response);

    } catch (error) {
        console.error("Update Report Error:", error);
        const response = { ...errorResponseBody };
        response.message = "Failed to update report.";
        response.err = { details: error.message };
        return res.status(STATUS.INTERNAL_SERVER_ERROR).json(response);
    }
};

const deleteReport = async (req, res) => {
    try {
        const reportNumber = req.params.report_number;
        const reportId = req.validReportId;

        const { error } = await supabase
            .from("reports")
            .update({
                is_deleted: true,
                deleted_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            })
            .eq("report_id", reportId);

        if (error) throw error;

        const response = { ...successResponseBody };
        response.message = "Report deleted successfully.";
        response.body = { report_number: reportNumber };
        return res.status(STATUS.OK).json(response);

    } catch (error) {
        console.error("Delete Report Error:", error);
        const response = { ...errorResponseBody };
        response.message = "Failed to delete report.";
        response.err = { details: error.message };
        return res.status(STATUS.INTERNAL_SERVER_ERROR).json(response);
    }
};

const getDeletedReports = async (req, res) => {
    try {
        const { data: reports, error } = await supabase
            .from("reports")
            .select("*")
            .eq("is_deleted", true)
            .order("deleted_at", { ascending: false });

        if (error) throw error;

        const response = { ...successResponseBody };
        response.message = "Deleted reports fetched successfully.";
        response.body = reports;
        return res.status(STATUS.OK).json(response);

    } catch (error) {
        console.error("Get Deleted Reports Error:", error);
        const response = { ...errorResponseBody };
        response.message = "Failed to fetch deleted reports.";
        response.err = { details: error.message };
        return res.status(STATUS.INTERNAL_SERVER_ERROR).json(response);
    }
};

const updateDeletedReport = async (req, res) => {
    try {
        const { report_id, officer_ids } = req.body;

        // Restore the report
        const { data: restoredReport, error: restoreError } = await supabase
            .from("reports")
            .update({
                is_deleted: false,
                deleted_at: null,
                updated_at: new Date().toISOString()
            })
            .eq("report_id", report_id)
            .eq("is_deleted", true)
            .select()
            .single();

        if (restoreError) throw restoreError;

        if (!restoredReport) {
            const response = { ...errorResponseBody };
            response.message = "Report not found or not deleted.";
            response.err = { report_id: "No deleted report found with this ID." };
            return res.status(STATUS.NOT_FOUND).json(response);
        }

        // Re-assign officers
        // Remove old assignments first
        const { error: deleteError } = await supabase
            .from("report_users")
            .delete()
            .eq("report_id", report_id);

        if (deleteError) throw deleteError;

        // Insert new assignments
        const officerEntries = officer_ids.map(user_id => ({
            report_id,
            user_id
        }));

        const { error: insertError } = await supabase
            .from("report_users")
            .insert(officerEntries);

        if (insertError) throw insertError;

        const response = { ...successResponseBody };
        response.message = "Report restored successfully.";
        response.body = restoredReport;
        return res.status(STATUS.OK).json(response);

    } catch (error) {
        console.error("Update Deleted Report Error:", error);
        const response = { ...errorResponseBody };
        response.message = "Failed to restore report.";
        response.err = { details: error.message };
        return res.status(STATUS.INTERNAL_SERVER_ERROR).json(response);
    }
};

export default {
    createReport,
    getReport,
    getReportByUserId,
    getReportByEmailId,
    getOfficersReportsCount,
    updateReport,
    deleteReport,
    getDeletedReports,
    updateDeletedReport
};
