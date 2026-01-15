import { supabase } from "../supabase.js"
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

const getTotalCaseCount = async (req, res) => {
    try {
        const officerId = req.params.user_id;

        const { count, error } = await supabase
            .from('case_users')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', officerId);

        if (error) throw error;

        const response = { ...successResponseBody };

        response.message = "Total assigned cases count retrieved successfully.";
        response.data = {
            total_cases_assigned: count || 0
        };

        return res.status(STATUS.OK).json(response);

    } catch (error) {
        console.error("Get total cases count error:", error);

        const response = { ...errorResponseBody };

        response.message = "Internal Server Error";
        response.err = {
            details: error.message || "An unexpected error occurred while fetching the case count."
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

        const response = { ...successResponseBody };
        response.message = status
            ? `Officer's ${status} case count retrieved.`
            : "Officer's total case count retrieved.";

        response.data = {
            user_id: officerId,
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

const getCaseById = async (req, res) => {
    const officerId = req.params.user_id;

    try {
        const selectString = "cases(case_number, title, status, priority, created_at, deadline, section_under_ipc)";

        const { data, error } = await supabase
            .from('case_users')
            .select(selectString)
            .eq('user_id', officerId)
            .eq('cases.is_deleted', false);

        if (error) throw error;

        const processedData = data.map(item => {
            if (item.cases) {
                return {
                    ...item.cases,
                };
            }
            return null;
        }).filter(item => item !== null); // Remove any nulls if join failed

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
}

const getCaseByEmailId = async (req, res) => {
    const { email_id } = req.body;

    try {
        const { data, error } = await supabase
            .from('case_users')
            .select(`
                    cases!inner (  // <--- Changed to !inner to enforce the filter
                        case_id, 
                        title, 
                        status, 
                        deadline, 
                        priority, 
                        created_at, 
                        case_number, 
                        section_under_ipc
                    ),
                    users!inner(email_id)
                `)
            .eq('users.email_id', email_id)
            .eq('cases.is_deleted', false);

        if (error) throw error;

        const processedCaseList = (data || [])
            .map(item => item.cases) // Extract just the 'cases' object
            .filter(caseItem => caseItem !== null) // Safety check for nulls
            .map(caseItem => ({
                ...caseItem,
            }));

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
}

const updateCase = async (req, res) => {
    try {
        const updates = req.validCaseUpdates;
        const caseNumber = req.targetCaseNumber;

        if (!updates || !caseNumber) {
            const response = { ...errorResponseBody };
            response.message = "Internal Server Error";
            response.err = { details: "Middleware failed to pass update data." };
            return res.status(STATUS.INTERNAL_SERVER_ERROR).json(response);
        }

        const { data: updatedCase, error } = await supabase
            .from("cases")
            .update(updates)
            .eq("case_number", caseNumber)
            .eq('is_deleted', false)
            .select("case_number, title, status, priority, deadline, section_under_ipc")
            .single();

        if (error) throw error;

        if (!updatedCase) {
            const response = { ...errorResponseBody };
            response.message = "Update Failed";
            response.err = {
                case_number: `Case with number '${caseNumber}' not found.`
            };
            return res.status(STATUS.NOT_FOUND).json(response);
        }

        const response = { ...successResponseBody };
        response.message = "Case updated successfully.";
        response.data = updatedCase;

        return res.status(STATUS.OK).json(response);

    } catch (error) {
        console.error("Update Case Error:", error);

        const response = { ...errorResponseBody };

        if (error.code === 'PGRST102') {
            response.message = "Update Failed";
            response.err = { details: "Empty update payload." };
            return res.status(STATUS.BAD_REQUEST).json(response);
        }

        response.message = "Internal Server Error";
        response.err = { details: error.message };

        return res.status(STATUS.INTERNAL_SERVER_ERROR).json(response);
    }
}

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

        const response = { ...successResponseBody };
        response.message = "Case deleted successfully (moved to archive).";
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
    const caseNumber = req.query.case_number; // Get from Query

    try {
        // ==================================================
        // SCENARIO 1: Specific Case Requested
        // ==================================================
        if (caseNumber) {
            const { data, error } = await supabase
                .from("cases")
                .select(`
                    case_id,
                    case_number,
                    title,
                    status,
                    priority,
                    deadline,
                    section_under_ipc,
                    created_at,
                    updated_at
                `)
                .eq("case_number", caseNumber)
                .eq("is_deleted", false) // Filter Soft Delete
                .maybeSingle();

            if (error) throw error;

            if (!data) {
                const response = { ...errorResponseBody };
                response.message = "Case Not Found";
                response.err = { 
                    details: `Case '${caseNumber}' does not exist or has been deleted.` 
                };
                return res.status(STATUS.NOT_FOUND).json(response);
            }

            const response = { ...successResponseBody };
            response.message = "Case details retrieved successfully.";
            response.data = data; // Returns a single Object

            return res.status(STATUS.OK).json(response);
        }

        // ==================================================
        // SCENARIO 2: Fetch ALL Active Cases
        // ==================================================
        const { data, error } = await supabase
            .from("cases")
            .select(`
                case_id,
                case_number,
                title,
                status,
                priority,
                deadline,
                section_under_ipc,
                created_at
            `)
            .eq("is_deleted", false) // Filter Soft Delete
            .order('created_at', { ascending: false }); // Latest first

        if (error) throw error;

        const response = { ...successResponseBody };
        response.message = "All active cases retrieved successfully.";
        response.data = data; // Returns an Array of Objects

        return res.status(STATUS.OK).json(response);

    } catch (error) {
        console.error("Get Case Error:", error);

        const response = { ...errorResponseBody };
        response.message = "Internal Server Error";
        response.err = { details: error.message };

        return res.status(STATUS.INTERNAL_SERVER_ERROR).json(response);
    }
}

export default {
    createCase,
    getTotalCaseCount,
    getOfficersCaseCount,
    getCaseById,
    getCaseByEmailId,
    updateCase,
    deleteCase,
    getCase
}