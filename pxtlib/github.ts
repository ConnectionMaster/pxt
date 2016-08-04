namespace pxt.github {
    interface GHRef {
        ref: string;
        url: string;
        object: {
            sha: string;
            type: string;
            url: string;
        }
    }

    export function listRefsAsync(repopath: string, namespace = "tags") {
        return U.httpGetJsonAsync("https://api.github.com/repos/" + repopath + "/git/refs/" + namespace + "/?per_page=100")
            .then<string[]>((resp: GHRef[]) => {
                let tagnames = resp
                    .map(x => x.ref.replace(/^refs\/[^\/]+\//, ""))
                tagnames.sort(semver.strcmp)
                return tagnames
            }, err => {
                if (err.statusCode == 404) return []
                else return Promise.reject(err)
            })
    }

    function resolveRefAsync(r: GHRef): Promise<string> {
        if (r.object.type == "commit")
            return Promise.resolve(r.object.sha)
        else if (r.object.type == "tag")
            return U.httpGetJsonAsync(r.object.url)
                .then((r: GHRef) =>
                    r.object.type == "commit" ? r.object.sha :
                        Promise.reject(new Error("Bad type (2nd order) " + r.object.type)))
        else
            return Promise.reject(new Error("Bad type " + r.object.type))
    }

    export function tagToShaAsync(repopath: string, tag: string) {
        if (/^[a-f0-9]{40}$/.test(tag))
            return Promise.resolve(tag)
        return U.httpGetJsonAsync("https://api.github.com/repos/" + repopath + "/git/refs/tags/" + tag)
            .then(resolveRefAsync, e =>
                U.httpGetJsonAsync("https://api.github.com/repos/" + repopath + "/git/refs/heads/" + tag)
                    .then(resolveRefAsync))
    }

    export interface CachedPackage {
        sha: string;
        files: U.Map<string>;
    }

    export function pkgConfigAsync(repopath: string, tag = "master") {
        let url = "https://raw.githubusercontent.com/" + repopath + "/" + tag + "/" + pxt.configName
        return U.httpGetTextAsync(url)
            .then(v => JSON.parse(v) as pxt.PackageConfig)
    }

    export function downloadPackageAsync(repoWithTag: string, current: CachedPackage = null) {
        let p = parseRepoId(repoWithTag)
        return tagToShaAsync(p.repo, p.tag)
            .then(sha => {
                let pref = "https://raw.githubusercontent.com/" + p.repo + "/" + sha + "/"
                if (!current) current = { sha: "", files: {} }
                if (current.sha === sha) return Promise.resolve(current)
                else {
                    console.log(`Downloading ${repoWithTag} -> ${sha}`)
                    return U.httpGetTextAsync(pref + pxt.configName)
                        .then(pkg => {
                            current.files = {}
                            current.sha = ""
                            current.files[pxt.configName] = pkg
                            let cfg: pxt.PackageConfig = JSON.parse(pkg)
                            return Promise.map(cfg.files.concat(cfg.testFiles || []),
                                fn => U.httpGetTextAsync(pref + fn)
                                    .then(text => {
                                        current.files[fn] = text
                                    }))
                                .then(() => {
                                    current.sha = sha
                                    return current
                                })
                        })
                }
            })
    }

    export interface Repo {
        id: number;
        name: string; // "pxt-microbit-cppsample",
        full_name: string; // "Microsoft/pxt-microbit-cppsample",
        owner: {
            login: string; // "Microsoft",
            id: number; // 6154722,
            avatar_url: string; // "https://avatars.githubusercontent.com/u/6154722?v=3",
            gravatar_id: string; // "",
            html_url: string; // "https://github.com/Microsoft",
            type: string; // "Organization"
        },
        private: boolean;
        html_url: string; // "https://github.com/Microsoft/pxt-microbit-cppsample",
        description: string; // "Sample C++ extension for PXT/microbit",
        fork: boolean;
        created_at: string; // "2016-05-05T11:18:12Z",
        updated_at: string; // "2016-06-20T02:25:03Z",
        pushed_at: string; // "2016-05-05T11:59:42Z",
        homepage: string; // null,
        size: number; // 4
        stargazers_count: number;
        watchers_count: number;
        forks_count: number;
        open_issues_count: number;
        forks: number;
        open_issues: number;
        watchers: number;
        default_branch: string; // "master",
        score: number; // 6.7371006

        // non-github, added to track search request
        tag?: string;
    }

    export interface SearchResults {
        total_count: number;
        incomplete_results: boolean;
        items: Repo[];
    }

    export function searchAsync(query: string): Promise<SearchResults> {
        let id = parseRepoUrl(query);
        if (id && id.repo)
            return U.httpGetJsonAsync("https://api.github.com/repos/" + id.repo)
                .then(r => {
                    let repo = r as Repo;
                    repo.tag = id.tag;
                    return <SearchResults>{
                        total_count: 1,
                        incomplete_results: false,
                        items: [repo]
                    }
                })

        query += ` in:name,description,readme "for PXT/${appTarget.id}"`
        return U.httpGetJsonAsync("https://api.github.com/search/repositories?q=" + encodeURIComponent(query))
            .then(r => r as SearchResults)
    }

    export function parseRepoUrl(url: string) {
        let m = /^((https:\/\/)?github.com\/)?([^/]+\/[^/#]+)(#(\w+))?$/i.exec(url.trim());
        return {
            repo: m ? m[3].toLowerCase() : null,
            tag: m ? m[5] : null
        }
    }

    export function parseRepoId(repo: string) {
        repo = repo.replace(/^github:/i, "")
        let m = /([^#]+)#(.*)/.exec(repo)
        return {
            repo: m ? m[1].toLowerCase() : repo.toLowerCase(),
            tag: m ? m[2] : null
        }
    }

    export function isGithubId(id: string) {
        return id.slice(0, 7) == "github:"
    }

    export function noramlizeRepoId(id: string) {
        let p = parseRepoId(id)
        return "github:" + p.repo.toLowerCase() + "#" + (p.tag || "master")
    }
}