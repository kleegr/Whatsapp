"use client"
import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
    QrCode,
    Trash2,
    Plus,
    Smartphone,
    RefreshCw,
    AlertCircle,
    CheckCircle,
    Loader2,
    X,
    LogOut,
    Download
} from 'lucide-react';
import SsoHandler from '../../lib/ssoHandler';
import { toast } from 'react-toastify';
import axios from 'axios';

interface WhatsappInstance {
    id: number;
    idInstance: string;
    typeInstance: string;
    userId: string;
    createdAt: string;
    status?: string;
    name?: string;
}

interface SyncProgress {
    status: 'idle' | 'syncing' | 'done' | 'error';
    phase: string;
    totalContacts: number;
    processedContacts: number;
    totalHistoryJobs: number;
    completedHistoryJobs: number;
    startedAt: number | null;
    error: string;
}

const WhatsAppManager = () => {
    const [instances, setInstances] = useState<WhatsappInstance[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const [qrModalOpen, setQrModalOpen] = useState(false);
    const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);
    const [ssodata, setSsoData] = useState<any>(null);

    const { SSO, checkSSO } = SsoHandler();


    const ssoConfig = {
        app_id: process.env.NEXT_PUBLIC_APP_ID || "",
        key: process.env.NEXT_PUBLIC_SSO_KEY || "",
    };


    useEffect(() => {
        checkSSO(ssoConfig);
    }, []);

    useEffect(() => {
        if (SSO) {
            try {
                const data = JSON.parse(SSO);
                setSsoData(data);
                console.log("SSO Data:", data);
            } catch (e) {
                console.error("Failed to parse SSO data", e);
            }
        }
    }, [SSO]);


    useEffect(() => {
        if (ssodata?.activeLocation) {
            fetchInstances();
        }
    }, [ssodata]);



    const fetchInstances = async () => {
        if (!ssodata?.activeLocation) return;
        setIsLoading(true);
        try {
            const res = await axios.get(`/api/instances?locationId=${ssodata.activeLocation}`);
            if (res.data.success) {
                const fetchedInstances = res.data.data;
                setInstances(fetchedInstances);

                // Fetch status for each instance
                fetchedInstances.forEach((inst: WhatsappInstance) => {
                    fetchInstanceStatus(inst.idInstance);
                });
            }
        } catch (error) {
            console.error("Error fetching instances:", error);
            toast.error("Failed to load instances");
        } finally {
            setIsLoading(false);
        }
    };


    useEffect(() => {
        if (ssodata?.activeLocation) {
            fetchInstances();
        }
    }, [ssodata?.activeLocation]);

    const fetchInstanceStatus = async (idInstance: string) => {
        try {
            const res = await axios.get(`/api/instance-status?idInstance=${idInstance}`);
            if (res.data.success && res.data.data) {
                const state = res.data.data.stateInstance;
                setInstances(prev => prev.map(inst =>
                    inst.idInstance === idInstance ? { ...inst, status: state } : inst
                ));
            }
        } catch (error) {
            console.error(`Error fetching status for ${idInstance}`, error);
        }
    }



    console.log("ssoDATA", ssodata);

    const currentUserId = ssodata?.userId;
    const userHasInstance = instances.some(inst => inst.userId === currentUserId);

    const handleCreateInstance = async () => {
        if (!ssodata?.activeLocation) return;

        setIsCreating(true);
        try {
            const userId = currentUserId;

            if (!userId) {
                toast.error("User ID not found in SSO data. Cannot create instance.");
                setIsCreating(false);
                return;
            }

            const res = await axios.post('/api/instances', {
                locationId: ssodata.activeLocation,
                companyId: ssodata.companyId,
                userId: userId
            });

            if (res.data.success) {
                toast.success("Instance created successfully!");
                fetchInstances();
            } else {
                toast.error(res.data.error || "Failed to create instance");
            }
        } catch (error: any) {
            console.error("Error creating instance:", error);
            toast.error(error.response?.data?.error || "Failed to create instance");
        } finally {
            setIsCreating(false);
        }
    };

    const handleLogoutInstance = async (idInstance: string) => {
        if (!confirm("Are you sure you want to logout? You will need to re-scan the QR code to connect.")) return;

        try {
            const res = await axios.post('/api/logout', { idInstance });
            if (res.data.success) {
                toast.success("Logged out successfully");
                fetchInstanceStatus(idInstance);
            } else {
                toast.error("Failed to logout");
            }
        } catch (error) {
            console.error("Error logging out:", error);
            toast.error("Error logging out");
        }
    };

    const handleDeleteInstance = async (idInstance: string) => {
        if (!confirm("Are you sure you want to delete this instance? This action cannot be undone.")) return;

        try {
            const res = await axios.delete(`/api/instances?idInstance=${idInstance}`);
            if (res.data.success) {
                toast.success("Instance deleted successfully");
                fetchInstances();
            } else {
                toast.error("Failed to delete instance");
            }
        } catch (error) {
            console.error("Error deleting instance:", error);
            toast.error("Error deleting instance");
        }
    };

    // --- Sync Contacts State ---
    const [syncProgress, setSyncProgress] = useState<Record<string, SyncProgress>>({});
    const syncPollingRef = useRef<Record<string, NodeJS.Timeout>>({});

    const startSyncPolling = useCallback((idInstance: string) => {
        // Clear any existing polling for this instance
        if (syncPollingRef.current[idInstance]) {
            clearInterval(syncPollingRef.current[idInstance]);
        }

        const poll = async () => {
            try {
                const res = await axios.get(`/api/instances/sync-contacts/status?idInstance=${idInstance}`);
                if (res.data.success && res.data.data) {
                    const progress = res.data.data as SyncProgress;
                    setSyncProgress(prev => ({ ...prev, [idInstance]: progress }));

                    if (progress.status === 'done') {
                        toast.success("Sync completed successfully!");
                        if (syncPollingRef.current[idInstance]) {
                            clearInterval(syncPollingRef.current[idInstance]);
                            delete syncPollingRef.current[idInstance];
                        }
                    } else if (progress.status === 'error') {
                        toast.error(`Sync failed: ${progress.error}`);
                        if (syncPollingRef.current[idInstance]) {
                            clearInterval(syncPollingRef.current[idInstance]);
                            delete syncPollingRef.current[idInstance];
                        }
                    }
                }
            } catch (err) {
                console.error("Error polling sync status:", err);
            }
        };

        poll(); // Immediate first poll
        syncPollingRef.current[idInstance] = setInterval(poll, 2000);
    }, []);

    // On mount, check if any instances have an active sync
    useEffect(() => {
        if (instances.length > 0) {
            instances.forEach(inst => {
                if (inst.status === 'authorized') {
                    axios.get(`/api/instances/sync-contacts/status?idInstance=${inst.idInstance}`)
                        .then(res => {
                            if (res.data.success && res.data.data) {
                                const progress = res.data.data as SyncProgress;
                                if (progress.status === 'syncing') {
                                    setSyncProgress(prev => ({ ...prev, [inst.idInstance]: progress }));
                                    startSyncPolling(inst.idInstance);
                                } else if (progress.status === 'done' || progress.status === 'error') {
                                    setSyncProgress(prev => ({ ...prev, [inst.idInstance]: progress }));
                                }
                            }
                        })
                        .catch(() => { });
                }
            });
        }

        return () => {
            Object.values(syncPollingRef.current).forEach(clearInterval);
            syncPollingRef.current = {};
        };
    }, [instances.length]);

    const handleSyncContacts = async (idInstance: string) => {
        const currentProgress = syncProgress[idInstance];
        if (currentProgress?.status === 'syncing') {
            toast.info("Sync is already in progress");
            return;
        }

        if (!confirm("This will sync all WhatsApp contacts and their chat history to GoHighLevel. This may take a while. Continue?")) {
            return;
        }

        try {
            const res = await axios.post('/api/instances/sync-contacts', { idInstance });
            if (res.data.success) {
                toast.success("Sync started! You can navigate away - it will continue in the background.");
                startSyncPolling(idInstance);
            } else {
                toast.error(res.data.error || "Failed to start sync");
            }
        } catch (error: any) {
            const errMsg = error.response?.data?.error || "Failed to start sync";
            toast.error(errMsg);
        }
    };

    const [qrUrl, setQrUrl] = useState<string | null>(null);

    // Poll for QR code to prevent expiration
    useEffect(() => {
        let qrIntervalId: NodeJS.Timeout;
        let statusIntervalId: NodeJS.Timeout;

        const fetchQr = async () => {
            if (!selectedInstanceId || !qrModalOpen) return;

            try {
                const res = await axios.get(`/api/qr?idInstance=${selectedInstanceId}&_t=${Date.now()}`);
                if (res.data.success && res.data.url) {
                    setQrUrl(res.data.url);
                }
            } catch (error) {
                console.error("Error fetching QR code", error);
            }
        };

        const checkStatus = async () => {
            if (!selectedInstanceId || !qrModalOpen) return;
            try {
                const res = await axios.get(`/api/instance-status?idInstance=${selectedInstanceId}&_t=${Date.now()}`);
                if (res.data.success && res.data.data) {
                    const state = res.data.data.stateInstance;
                    if (state === 'authorized') {
                        toast.success("Instance authorized successfully!");
                        setQrModalOpen(false);
                        fetchInstances();
                    }
                }
            } catch (error) {
                // ignore errors during polling
            }
        };

        if (qrModalOpen && selectedInstanceId) {
            fetchQr();
            checkStatus();

            qrIntervalId = setInterval(fetchQr, 15000);
            statusIntervalId = setInterval(checkStatus, 3000);
        }

        return () => {
            if (qrIntervalId) clearInterval(qrIntervalId);
            if (statusIntervalId) clearInterval(statusIntervalId);
        };
    }, [qrModalOpen, selectedInstanceId]);

    const openQrModal = (idInstance: string) => {
        setSelectedInstanceId(idInstance);
        setQrUrl(null);
        setQrModalOpen(true);
    };

    const handleCloseQrModal = () => {
        setQrModalOpen(false);
        if (selectedInstanceId) {
            fetchInstanceStatus(selectedInstanceId);
        }
    };

    const ActivationTimer = ({ createdAt, onComplete }: { createdAt: string, onComplete: () => void }) => {
        const duration = 90000;
        const [timeLeft, setTimeLeft] = useState(0);

        useEffect(() => {
            const calculateTime = () => {
                const created = new Date(createdAt).getTime();
                const now = Date.now();
                const elapsed = now - created;
                const remaining = Math.max(0, duration - elapsed);
                return remaining;
            };

            setTimeLeft(calculateTime());

            const interval = setInterval(() => {
                const remaining = calculateTime();
                setTimeLeft(remaining);
                if (remaining <= 0) {
                    clearInterval(interval);
                    onComplete();
                }
            }, 1000);

            return () => clearInterval(interval);
        }, [createdAt]);

        const progress = Math.min(100, Math.max(0, ((duration - timeLeft) / duration) * 100));
        const seconds = Math.ceil(timeLeft / 1000);

        if (timeLeft <= 0) return null;

        return (
            <div className="flex-1 flex flex-col items-center justify-center gap-2 bg-gray-50 py-2 rounded-xl border border-gray-100 h-[48px]">
                <div className="flex items-center gap-2 text-xs text-gray-500 font-medium">
                    <Loader2 className="w-3 h-3 animate-spin text-blue-500" />
                    <span>Activating Instance... {seconds}s</span>
                </div>
                <div className="w-full px-4 max-w-[140px]">
                    <div className="h-1 w-full bg-gray-200 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-blue-500 transition-all duration-1000 linear"
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                </div>
            </div>
        );
    };

    const [tick, setTick] = useState(0);

    const isInstanceReady = (createdAt: string) => {
        return (Date.now() - new Date(createdAt).getTime()) > 90000;
    };

    const SyncProgressBar = ({ progress }: { progress: SyncProgress }) => {
        if (progress.status === 'done') {
            return (
                <div className="bg-green-50 border border-green-200 rounded-xl p-3">
                    <div className="flex items-center gap-2 text-green-700 text-sm font-medium">
                        <CheckCircle className="w-4 h-4" />
                        <span>Sync complete! {progress.totalContacts} contacts synced.</span>
                    </div>
                </div>
            );
        }

        if (progress.status === 'error') {
            return (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                    <div className="flex items-center gap-2 text-red-700 text-sm font-medium">
                        <AlertCircle className="w-4 h-4" />
                        <span>Sync failed: {progress.error || 'Unknown error'}</span>
                    </div>
                </div>
            );
        }

        if (progress.status !== 'syncing') return null;

        const isContactPhase = progress.phase === 'contacts' || progress.phase === 'starting';
        const isHistoryPhase = progress.phase === 'history';

        let percent = 0;
        let label = 'Starting sync...';

        if (isContactPhase && progress.totalContacts > 0) {
            percent = Math.round((progress.processedContacts / progress.totalContacts) * 100);
            label = `Syncing contacts: ${progress.processedContacts}/${progress.totalContacts}`;
        } else if (isHistoryPhase && progress.totalHistoryJobs > 0) {
            percent = Math.round((progress.completedHistoryJobs / progress.totalHistoryJobs) * 100);
            label = `Syncing chat history: ${progress.completedHistoryJobs}/${progress.totalHistoryJobs}`;
        } else if (progress.phase === 'starting') {
            label = 'Starting sync...';
        }

        return (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
                <div className="flex items-center justify-between text-xs text-blue-700 font-medium mb-2">
                    <div className="flex items-center gap-2">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span>{label}</span>
                    </div>
                    <span>{percent}%</span>
                </div>
                <div className="h-2 w-full bg-blue-100 rounded-full overflow-hidden">
                    <div
                        className="h-full bg-blue-500 transition-all duration-500 ease-out rounded-full"
                        style={{ width: `${percent}%` }}
                    />
                </div>
                <p className="text-[10px] text-blue-500 mt-1.5">You can navigate away - sync continues in the background</p>
            </div>
        );
    };







    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 p-6 md:p-12 font-sans">
            <div className="max-w-6xl mx-auto">
                {/* Header */}
                <header className="mb-10 text-center md:text-left flex flex-col md:flex-row justify-between items-center">
                    <div>
                        <h1 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600 mb-2">
                            WhatsApp Instances
                        </h1>
                        <p className="text-gray-500 text-lg">Manage your connections for this subaccount</p>
                    </div>

                    <button
                        onClick={handleCreateInstance}
                        disabled={isCreating}
                        className={`mt-4 md:mt-0 px-6 py-3 rounded-xl font-bold text-white shadow-lg hover:shadow-xl transition-all transform hover:-translate-y-1 active:scale-95 flex items-center gap-2 ${isCreating ? "bg-gray-400 cursor-wait" : "bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600"
                            }`}
                    >
                        {isCreating ? <Loader2 className="animate-spin w-5 h-5" /> : <Plus className="w-5 h-5" />}
                        <span>Add Connection</span>
                    </button>
                </header>

                {/* Content */}
                {isLoading && !qrModalOpen ? (
                    <div className="flex justify-center items-center h-64">
                        <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
                    </div>
                ) : instances.length === 0 ? (
                    <div className="bg-white/70 backdrop-blur-md rounded-3xl p-12 text-center border border-white shadow-xl">
                        <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-6">
                            <Smartphone className="w-10 h-10 text-blue-500" />
                        </div>
                        <h2 className="text-2xl font-bold text-gray-800 mb-2">No connections Found</h2>
                        <p className="text-gray-500 mb-8">You haven't connected any WhatsApp accounts for this subaccount yet.</p>
                        <button
                            onClick={handleCreateInstance}
                            disabled={isCreating}
                            className="bg-blue-600 text-white px-8 py-3 rounded-xl font-semibold hover:bg-blue-700 transition shadow-lg"
                        >
                            Add Connection
                        </button>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {instances.map((instance) => (
                            <div key={instance.id} className="group bg-white rounded-3xl p-6 shadow-lg hover:shadow-2xl transition-all duration-300 border border-transparent hover:border-blue-100 relative overflow-hidden">
                                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                                    <Smartphone className="w-24 h-24 text-blue-600 transform rotate-12" />
                                </div>
                                <button
                                    onClick={() => handleDeleteInstance(instance.idInstance)}
                                    className="absolute top-4 right-4 p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-all z-10"
                                    title="Delete Instance"
                                >
                                    <Trash2 className="w-5 h-5" />
                                </button>

                                <div className="flex items-center gap-4 mb-6">
                                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-md text-white">
                                        <Smartphone className="w-7 h-7" />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-bold text-gray-800">
                                            {instance.name || `Instance #${instance.idInstance.substring(0, 8)}...`}
                                        </h3>
                                        <div className="mt-1">
                                            {instance.status === "authorized" ? (
                                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                                    <CheckCircle className="w-3 h-3 mr-1" />
                                                    Authorized
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                                                    <AlertCircle className="w-3 h-3 mr-1" />
                                                    {instance.status || "Checking..."}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-3 mb-6">
                                    <div className="flex justify-between text-sm text-gray-500">
                                        <span>User ID:</span>
                                        <span className="font-mono text-gray-700 truncate flex-1 text-right ml-2 min-w-0" title={instance.userId}>{instance.userId}</span>
                                    </div>
                                    <div className="flex justify-between text-sm text-gray-500">
                                        <span>Type:</span>
                                        <span className="capitalize text-gray-700">{instance.typeInstance}</span>
                                    </div>
                                    <div className="flex gap-2 text-sm text-gray-500">
                                        <span>Created:</span>
                                        <span className="text-gray-700">{new Date(instance.createdAt).toLocaleDateString()}</span>
                                    </div>
                                </div>

                                <div className="flex flex-col gap-3 mt-auto">
                                    {/* Sync Progress Bar */}
                                    {instance.status === "authorized" && syncProgress[instance.idInstance] && syncProgress[instance.idInstance].status !== 'idle' && (
                                        <SyncProgressBar progress={syncProgress[instance.idInstance]} />
                                    )}

                                    {instance.status === "authorized" ? (
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => handleSyncContacts(instance.idInstance)}
                                                disabled={syncProgress[instance.idInstance]?.status === 'syncing'}
                                                className={`flex-1 h-[48px] flex items-center justify-center gap-2 rounded-xl font-semibold text-sm transition-colors whitespace-nowrap ${syncProgress[instance.idInstance]?.status === 'syncing'
                                                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                                        : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                                                    }`}
                                            >
                                                {syncProgress[instance.idInstance]?.status === 'syncing' ? (
                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                ) : (
                                                    <Download className="w-4 h-4" />
                                                )}
                                                {syncProgress[instance.idInstance]?.status === 'syncing' ? 'Syncing...' : 'Sync Contacts'}
                                            </button>
                                            <button
                                                onClick={() => handleLogoutInstance(instance.idInstance)}
                                                className="flex-1 h-[48px] flex items-center justify-center gap-2 bg-indigo-50 text-indigo-600 rounded-xl font-semibold text-sm hover:bg-indigo-100 transition-colors whitespace-nowrap"
                                            >
                                                <LogOut className="w-4 h-4" />
                                                Logout
                                            </button>
                                        </div>
                                    ) : (
                                        !isInstanceReady(instance.createdAt) ? (
                                            <ActivationTimer
                                                createdAt={instance.createdAt}
                                                onComplete={() => setTick(t => t + 1)}
                                            />
                                        ) : (
                                            <button
                                                onClick={() => openQrModal(instance.idInstance)}
                                                className="flex-1 flex items-center justify-center gap-2 bg-blue-50 text-blue-600 py-3 rounded-xl font-semibold text-sm hover:bg-blue-100 transition-colors whitespace-nowrap"
                                            >
                                                <QrCode className="w-4 h-4" />
                                                Scan QR
                                            </button>
                                        )
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* QR Code / Connect Modal */}
            {/* QR Code / Connect Modal */}
            {qrModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-6 bg-gradient-to-r from-blue-600 to-indigo-600 flex justify-between items-center text-white">
                            <h3 className="text-xl font-bold">Scan QR Code</h3>
                            <button onClick={handleCloseQrModal} className="p-1 hover:bg-white/20 rounded-full transition">
                                <X className="w-6 h-6" />
                            </button>
                        </div>
                        <div className="p-8 flex flex-col items-center min-h-[300px] justify-center">
                            {qrUrl ? (
                                <>
                                    <div className="bg-white p-4 rounded-xl shadow-inner border border-gray-100 mb-6">
                                        <img
                                            src={qrUrl}
                                            alt="WhatsApp QR Code"
                                            className="w-64 h-64 object-contain"
                                        />
                                    </div>
                                    <p className="text-center text-gray-500 text-sm">
                                        Open WhatsApp on your phone, go to <strong>Settings {'>'} Linked Devices</strong>, and scan this code.
                                    </p>
                                </>
                            ) : (
                                <div className="flex flex-col items-center justify-center">
                                    <Loader2 className="w-12 h-12 text-blue-500 animate-spin mb-4" />
                                    <p className="text-gray-500 font-medium">Generating QR Code...</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default WhatsAppManager;
