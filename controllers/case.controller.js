import { supabase } from "../config/supabase.js"
import { isAdminForBack } from "../interceptors/user.interceptor.js";
import { STATUS } from "../utils/constants.js";
import { errorResponseBody, successResponseBody } from "../utils/responseBody.js";

const createCase = async (req, res) => {
    try {
        const { case_number, title, priority, assigned_officer_emails, section_under_ipc, deadline, under_7_years } = req.body;

        if (!case_number || !title || !priority || !section_under_ipc || under_7_years == undefined || !Array.isArray(assigned_officer_emails)) {
            const response = { ...errorResponseBody };
            response.message = "Validation Failed";
            response.err = {
                details: "Missing required fields: case_number, title, priority, section_under_ipc, under_7_years and assigned_officer_emails."
            };
            return res.status(STATUS.BAD_REQUEST).json(response);
        }

        let officerIds = [];

        if (assigned_officer_emails.length > 0) {
            const cleanEmails = assigned_officer_emails.map(email => email.toLowerCase().trim());

            const { data: officers, error: lookupError } = await supabase
                .from("users")
                .select("user_id, email_id")
                .in("email_id", cleanEmails);

            if (lookupError) throw lookupError;

            // Check if any officers are missing
            if (!officers || officers.length !== cleanEmails.length) {
                const foundEmails = new Set(officers.map(o => o.email_id));
                const missingEmails = cleanEmails.filter(email => !foundEmails.has(email));

                const response = { ...errorResponseBody };
                response.message = "Officer Verification Failed";
                response.err = {
                    details: "One or more assigned officers are not registered in the system.",
                    missing_officers: missingEmails
                };
                return res.status(STATUS.NOT_FOUND).json(response);
            }

            officerIds = officers.map(officer => officer.user_id);

            const adminCheck = await isAdminForBack({ user_id: req.user.user_id });

            if (!adminCheck) {
                // Get current user's email from users table
                const { data: currentUserData, error: userError } = await supabase
                    .from("users")
                    .select("email_id")
                    .eq("user_id", req.user.user_id)
                    .single();

                if (userError) throw userError;

                const isSelfIncluded = cleanEmails.includes(currentUserData.email_id.toLowerCase().trim());

                if (!isSelfIncluded) {
                    const response = { ...errorResponseBody };
                    response.message = "Validation Failed";
                    response.err = {
                        assigned_officer_emails: "You must include yourself as an assigned officer."
                    };
                    return res.status(STATUS.FORBIDDEN).json(response);
                }
            }
        }

        const newCaseData = {
            case_number: case_number.trim(),
            title: title.trim(),
            priority,
            section_under_ipc,
            under_7_years,
            ...(deadline && { deadline }),
        };

        const { data: insertedCase, error: insertError } = await supabase
            .from("cases")
            .insert([newCaseData])
            .select('case_id')
            .single();

        if (insertError) {
            // Handle duplicate case number
            if (insertError.code === '23505') {
                const response = { ...errorResponseBody };
                response.message = "Case Creation Failed";
                response.err = {
                    field: "case_number",
                    message: `Case Number '${case_number}' already exists.`
                };
                return res.status(409).json(response);
            }
            throw insertError;
        }

        const newCaseId = insertedCase.case_id;

        if (officerIds.length > 0) {
            const joinRecords = officerIds.map(userId => ({
                case_id: newCaseId,
                user_id: userId,
            }));

            const { error: joinError } = await supabase
                .from("case_users")
                .insert(joinRecords);

            if (joinError) throw joinError;
        }
        const response = { ...successResponseBody };
        response.message = "New case created and officers assigned successfully.";
        response.data = {
            case_id: newCaseId,
            case_number: newCaseData.case_number
        };

        return res.status(STATUS.CREATED).json(response);

    } catch (error) {
        console.error("Create Case Error:", error);

        const response = { ...errorResponseBody };
        response.message = "Internal Server Error";
        response.err = {
            details: error.message || "An unexpected error occurred."
        };

        return res.status(STATUS.INTERNAL_SERVER_ERROR).json(response);
    }
}

const getOfficersCaseCount = async (req, res) => {
    const officerId = req.query.user_id;
    const status = req.query.status;

    try {
        // ==================================================
        // SCENARIO 1: No ID -> LIST ALL OFFICERS
        // ==================================================
        if (!officerId) {

            // 1. Fetch Users AND their Cases (with status)
            const { data, error } = await supabase
                .from('users')
                .select(`
                    name, 
                    case_users (
                        cases (
                            status
                        )
                    )
                `)
                .eq('is_deleted', false);

            if (error) throw error;

            const cleanerData = data.map(user => {
                const allAssignedCases = user.case_users || [];

                let validCases = allAssignedCases;

                if (status) {
                    validCases = allAssignedCases.filter(item =>
                        item.cases && item.cases.status === status
                    );
                }

                return {
                    name: user.name,
                    count: validCases.length // We count the array length here
                };
            });

            const response = { ...successResponseBody };
            response.message = status
                ? `Officers' ${status} case counts retrieved.`
                : "All officers' total case counts retrieved.";
            response.data = cleanerData;

            return res.status(STATUS.OK).json(response);
        }

        // ==================================================
        // SCENARIO 2: ID Provided -> SPECIFIC OFFICER STATS
        // ==================================================

        // 1. First, fetch the User's Name
        const { data: userData, error: userError } = await supabase
            .from('users')
            .select('name')
            .eq('user_id', officerId)
            .single(); // Use single() since we expect one user

        if (userError) throw userError;

        // 2. Then, fetch the Case Count (Existing Logic)
        let query = supabase
            .from('case_users')
            .select(
                `case_id, cases!inner ( status )`,
                { count: 'exact', head: true }
            )
            .eq('user_id', officerId);

        if (status) {
            query = query.eq('cases.status', status);
        }

        const { count, error } = await query;

        if (error) throw error;

        // Construct Response
        const response = { ...successResponseBody };
        response.message = status
            ? `Officer's ${status} case count retrieved.`
            : "Officer's total case count retrieved.";

        response.data = {
            name: userData.name,
            status: status || 'All',
            count: count || 0
        };

        return res.status(STATUS.OK).json(response);

    } catch (error) {
        console.error("Get Officers Case Count Error: ", error);
        const response = { ...errorResponseBody };
        response.message = "Internal Server Error";
        response.err = { details: error.message };
        return res.status(STATUS.INTERNAL_SERVER_ERROR).json(response);
    }
}

const getCaseByUserID = async (req, res) => {
    const officerId = req.params.user_id;

    try {
        const selectString = `
            cases (
                case_number, title, status, priority, created_at, 
                deadline, section_under_ipc, under_7_years, stage,
                case_users (
                    users (
                        name
                    )
                )
            )
        `;

        const { data, error } = await supabase
            .from('case_users')
            .select(selectString)
            .eq('user_id', officerId)
            .eq('cases.is_deleted', false);

        if (error) throw error;

        const processedData = data
            .map(item => item.cases)
            .filter(caseItem => caseItem !== null)
            .map(caseItem => ({
                ...caseItem,
                involved_users: (caseItem.case_users || [])
                    .map(cu => cu.users)
                    .filter(u => u !== null)
                    .map(u => u.name.trim()),
                case_users: undefined
            }));

        const response = { ...successResponseBody };
        response.message = "Assigned cases retrieved successfully.";
        response.data = processedData;

        return res.status(STATUS.OK).json(response);

    } catch (error) {
        console.error("Get cases by officer error: ", error);

        const response = { ...errorResponseBody };
        response.message = "Internal Server Error";
        response.err = {
            details: error.message || "An error occurred while fetching the assigned cases."
        };

        return res.status(STATUS.INTERNAL_SERVER_ERROR).json(response);
    }
};

const getCaseByEmailId = async (req, res) => {
    const { email_id } = req.body;

    try {
        const { data, error } = await supabase
            .from('case_users')
            .select(`
                cases!inner (  
                    case_id, 
                    title, 
                    status, 
                    deadline, 
                    priority, 
                    created_at, 
                    case_number, 
                    section_under_ipc,
                    stage,
                    under_7_years,
                    case_users (
                        users (
                            name
                        )
                    )
                ),
                users!inner (
                    email_id
                )
            `)
            .eq('users.email_id', email_id)
            .eq('cases.is_deleted', false);

        if (error) throw error;

        const processedCaseList = (data || [])
            .map(item => item.cases)
            .filter(caseItem => caseItem !== null)
            .map(caseItem => {
                const involvedUsers = (caseItem.case_users || [])
                    .map(cu => cu.users)
                    .filter(u => u !== null)
                    .map(u => u.name.trim());

                return {
                    case_id: caseItem.case_id,
                    title: caseItem.title,
                    status: caseItem.status,
                    deadline: caseItem.deadline,
                    priority: caseItem.priority,
                    created_at: caseItem.created_at,
                    case_number: caseItem.case_number,
                    section_under_ipc: caseItem.section_under_ipc,
                    stage: caseItem.stage,
                    under_7_years: caseItem.under_7_years,
                    involved_users: involvedUsers
                };
            });

        const response = { ...successResponseBody };
        response.message = "Cases retrieved successfully by email.";
        response.data = processedCaseList;

        return res.status(STATUS.OK).json(response);

    } catch (error) {
        console.error("Get Case by Email Error: ", error);

        const response = { ...errorResponseBody };
        response.message = "Internal Server Error";
        response.err = {
            details: error.message || "An unexpected error occurred while fetching cases by email."
        };

        return res.status(STATUS.INTERNAL_SERVER_ERROR).json(response);
    }
};

const updateCase = async (req, res) => {
    try {
        const updates = req.validCaseUpdates;
        const caseNumber = req.targetCaseNumber;
        const caseId = req.targetCaseId;
        const assignedOfficers = req.validAssignedOfficers;

        // Update case fields
        const { data: updatedCase, error } = await supabase
            .from("cases")
            .update(updates)
            .eq("case_number", caseNumber)
            .eq('is_deleted', false)
            .select("case_id, case_number, title, status, priority, deadline, section_under_ipc, under_7_years, stage")
            .single();

        if (error) throw error;

        // Update assigned officers if provided
        if (assignedOfficers) {
            const { error: deleteError } = await supabase
                .from("case_users")
                .delete()
                .eq("case_id", updatedCase.case_id);

            if (deleteError) throw deleteError;

            const { error: insertError } = await supabase
                .from("case_users")
                .insert(assignedOfficers.map(user_id => ({
                    case_id: updatedCase.case_id,
                    user_id
                })));

            if (insertError) throw insertError;
        }

        // Fetch involved users
        const { data: caseUsers } = await supabase
            .from("case_users")
            .select("users(name)")
            .eq("case_id", updatedCase.case_id);

        const involved_users = (caseUsers || [])
            .map(cu => cu.users)
            .filter(u => u !== null)
            .map(u => u.name.trim());

        const response = { ...successResponseBody };
        response.message = "Case updated successfully.";
        response.data = { ...updatedCase, involved_users };

        return res.status(STATUS.OK).json(response);

    } catch (error) {
        console.error("Update Case Error:", error);
        return res.status(STATUS.INTERNAL_SERVER_ERROR).json({
            ...errorResponseBody,
            message: "Internal Server Error",
            err: { details: error.message }
        });
    }
};

const deleteCase = async (req, res) => {
    try {
        const caseId = req.validCaseId;

        if (!caseId) {
            const response = { ...errorResponseBody };
            response.message = "Internal Server Error";
            response.err = { details: "Middleware failed to provide a valid Case ID." };
            return res.status(STATUS.INTERNAL_SERVER_ERROR).json(response);
        }

        const { data, error } = await supabase
            .from("cases")
            .update({
                is_deleted: true,
                deleted_at: new Date().toISOString()
            })
            .eq("case_id", caseId)
            .select()
            .single();

        if (error) throw error;

        const { error: deleteError } = await supabase
            .from("case_users")
            .delete()
            .eq("case_id", caseId)
            .throwOnError();

        if (deleteError) throw deleteError;

        const response = { ...successResponseBody };
        response.message = "Case deleted successfully.";
        response.data = { case_id: caseId };

        return res.status(STATUS.OK).json(response);

    } catch (error) {
        console.error("Soft Delete Case Error:", error);

        const response = { ...errorResponseBody };
        response.message = "Internal Server Error";
        response.err = { details: error.message };

        return res.status(STATUS.INTERNAL_SERVER_ERROR).json(response);
    }
}

const getCase = async (req, res) => {
    const { case_number } = req.query;

    try {
        const columns = `
            case_id, case_number, title, status, priority, deadline, 
            section_under_ipc, created_at, updated_at, under_7_years, stage,
            case_users (
                users (
                    name
                )
            )
        `;

        let query = supabase
            .from("cases")
            .select(columns)
            .eq("is_deleted", false);

        if (case_number) {
            query = query.eq("case_number", case_number).maybeSingle();
        } else {
            query = query.order('created_at', { ascending: false });
        }

        const { data, error } = await query;
        if (error) throw error;

        if (case_number && !data) {
            return res.status(STATUS.NOT_FOUND).json({
                ...errorResponseBody,
                message: "Case Not Found",
                err: { details: `Case '${case_number}' does not exist or has been deleted.` }
            });
        }

        // Process assigned officers
        const processCase = (caseItem) => ({
            ...caseItem,
            involved_users: (caseItem.case_users || [])
                .map(cu => cu.users)
                .filter(u => u !== null)
                .map(u => u.name.trim()),
            case_users: undefined
        });

        const processedData = case_number
            ? processCase(data)
            : data.map(processCase);

        return res.status(STATUS.OK).json({
            ...successResponseBody,
            message: case_number ? "Case details retrieved successfully." : "All active cases retrieved successfully.",
            data: processedData
        });

    } catch (error) {
        console.error("Get Case Error:", error);
        return res.status(STATUS.INTERNAL_SERVER_ERROR).json({
            ...errorResponseBody,
            message: "Internal Server Error",
            err: { details: error.message }
        });
    }
};

const getDeletedCase = async (req, res) => {
    try {
        const { data: deletedCases, error } = await supabase
            .from("cases")
            .select("case_number, title, priority, section_under_ipc, deadline, status")
            .eq("is_deleted", true)
            .order("deleted_at", { ascending: false })
            .throwOnError();

        if (error) throw error;

        // Check if any deleted cases found
        if (!deletedCases || deletedCases.length === 0) {
            return res.status(STATUS.NOT_FOUND).json({
                message: "No deleted cases found."
            });
        }

        const response = { ...successResponseBody };
        response.message = "Deleted cases fetched successfully.";
        response.data = deletedCases;
        response.count = deletedCases.length

        return res.status(STATUS.OK).json(response);

    } catch (error) {
        console.error("getDeleted Case Error:", error);

        if (error.code === 'PGRST116') {
            errorResponseBody.err = { case_id: "Cases not found." };
            errorResponseBody.message = "Authentication Failed";
            return res.status(STATUS.NOT_FOUND).json(errorResponseBody);
        }

        errorResponseBody.message = "Internal server error during cases deletion retrieval.";
        return res.status(STATUS.INTERNAL_SERVER_ERROR).json(errorResponseBody);
    }
}

export default {
    createCase,
    getOfficersCaseCount,
    getCaseByUserID,
    getCaseByEmailId,
    updateCase,
    deleteCase,
    getCase,
    getDeletedCase
}