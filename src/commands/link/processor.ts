import { LinkProcessor, ComponentConfig, ComponentCode, UrlPath } from "link";
import { CLIError } from "../../errors";
import {
    ProcessedComponent, Content, LinkConfig, ProcessedLinkConfig, Url
} from "./interfaces";
import urljoin from "url-join";

const getProcessors = async (plugins: string[]): Promise<LinkProcessor[]> => {
    try {
        const linkProcessors: LinkProcessor[] = [];
        const importPromises: Promise<{}>[] = [];

        plugins.forEach(plugin => {
            const importPromise = import(plugin);
            importPromises.push(importPromise);
        });

        (await Promise.all(importPromises)).forEach(x => {
            const linkProcessorInstance = x.constructor() as LinkProcessor;
            linkProcessors.push(linkProcessorInstance);
        });

        return linkProcessors;
    } catch (error) {
        throw new CLIError(error.message);
    }
};

const processComponent = async (
    component: ComponentConfig,
    baseURLs: Url[],
    processors: LinkProcessor[]
): Promise<ProcessedComponent> => {
    const descriptions: Content[] = [];
    const snippets: Content[] = [];

    if (processors.length > 0) {
        const componentCodeMap: Map<string, ComponentCode> = new Map();

        // Execute all language processors on the component if supports
        const processorPromises = processors.map(async processor => {
            if (processor.supports(component)) {
                const componentCode = await processor.process(component);

                componentCodeMap.set(processor.getLang(), componentCode);
            }
        });

        await Promise.all(processorPromises);

        Object.keys(componentCodeMap).forEach(lang => {
            const componentCode = componentCodeMap.get(lang) as ComponentCode;

            descriptions.push({ lang, content: componentCode.description });
            snippets.push({ lang, content: componentCode.snippet });
        });
    }

    const urlPaths: UrlPath = new Map<string, string>();
    if (component.urlPaths) {
        component.urlPaths.forEach((url, type) => {
            const baseUrl = baseURLs.find(u => u.type === type);
            if (baseUrl) {
                urlPaths.set(type, urljoin(baseUrl.url, url));
            }
        });
    }

    return {
        path: component.path,
        name: component.name,
        zeplinNames: component.zeplinNames,
        urlPaths,
        description: descriptions.length > 0 ? descriptions[descriptions.length - 1].content : null, // Last description
        snippets
    } as ProcessedComponent;
};

const processLinkConfig = async (
    linkConfig: LinkConfig,
    linkProcessors: LinkProcessor[]
): Promise<ProcessedLinkConfig> => {
    let barrels: string[] = [];
    if (linkConfig.projects) {
        barrels = barrels.concat(linkConfig.projects);
    }
    if (linkConfig.styleguides) {
        barrels = barrels.concat(linkConfig.styleguides);
    }

    const components = await Promise.all(
        linkConfig.components.map(async component => {
            const processedComponent = await processComponent(component, linkConfig.baseURLs, linkProcessors);
            return processedComponent;
        })
    );

    return { barrels, components };
};

const processLinkConfigs = async (
    linkConfigs: LinkConfig[],
    processorModules: LinkProcessor[]
): Promise<ProcessedLinkConfig[]> => {
    const promises = linkConfigs.map(async linkConfig => {
        const processedLinkConfig = await processLinkConfig(linkConfig, processorModules);
        return processedLinkConfig;
    });

    const processedLinkConfigList = await Promise.all(promises);

    return processedLinkConfigList;
};

export {
    getProcessors,
    processLinkConfigs
};