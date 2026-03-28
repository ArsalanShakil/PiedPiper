// Fetch wrapper for all backend calls
const Api = {
    async get(url) {
        const res = await fetch(url);
        return res.json();
    },

    async post(url, data) {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        return { ok: res.ok, data: await res.json() };
    },

    async upload(url, formData) {
        const res = await fetch(url, {
            method: 'POST',
            body: formData,
        });
        return { ok: res.ok, data: await res.json() };
    }
};
