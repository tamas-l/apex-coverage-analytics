import fetch from 'node-fetch';

class Tooling {

    session;

    async connect(credentials) {
        const endpoint = new URL('/services/oauth2/token', credentials.target);
        const payload = new URLSearchParams();
        for (let key in credentials.grant) {
            payload.append(key, credentials.grant[key]);
        }
        const response = await fetch(endpoint.toString(), {
            method: 'POST',
            body: payload,
            redirect: 'follow',
            headers: {
                Accept: 'application/json'
            }
        });
        if (response.status == 200) {
            this.session = await response.json();
        } else {
            throw await response.json();
        }
        return this;
    }

    async query(query, recordList) {
        if (Math.random() > 0.8) {
            throw 'test';
        }
        const target = (query instanceof URL) ? query : this.getQueryURL(query);
        const response = await fetch(target, {
            method: 'GET',
            headers: {
                Authorization: 'Bearer ' + this.session.access_token,
                Accept: 'application/json'
            }
        });
        if (response.status == 200) {
            let data = await response.json();
            const records = Array.isArray(recordList) ? recordList.concat(data.records) : data.records;
            return data.done ? records : await this.query(new URL(data.nextRecordsUrl, this.session.instance_url), records);
        } else {
            throw await response.json();
        }
    }

    async queryApexCodeCoverage() {
        const query = 'SELECT ApexTestClass.Id, ApexTestClass.Name, TestMethodName, ApexClassorTrigger.Id, ApexClassorTrigger.Name, Coverage FROM ApexCodeCoverage';
        return this.query(query);
    }

    getQueryURL(query) {
        const endpoint = new URL("/services/data/v53.0/tooling/query/", this.session.instance_url);
        endpoint.searchParams.append('q', query);
        return endpoint;
    }

}

export { Tooling }