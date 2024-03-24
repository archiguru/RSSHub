import { Route } from '@/types';
import { getCurrentPath } from '@/utils/helpers';
const __dirname = getCurrentPath(import.meta.url);

import cache from '@/utils/cache';
import got from '@/utils/got';
import { load } from 'cheerio';
import { parseDate } from '@/utils/parse-date';
import { art } from '@/utils/render';
import * as path from 'node:path';
import timezone from '@/utils/timezone';

// 各地区url信息
const basicInfoDict = {
    绵竹市: {
        rootUrl: 'https://www.mz.gov.cn',
        infoType: {
            fdzdnr: {
                basicUrl: 'https://www.mz.gov.cn/info/iList.jsp?node_id=GKmzs&cat_id=15971&cur_page=1',
                name: '法定主动内容',
            },
            gsgg: {
                basicUrl: 'https://www.mz.gov.cn/info/iList.jsp?node_id=GKmzs&cat_id=24186&cur_page=1',
                name: '公示公告',
            },
        },
    },
};

const getInfoUrlList = async (rootUrl, infoBasicUrl) => {
    const response = await got(infoBasicUrl);
    const $ = load(response.data);
    // 非当前日期文章计数，部分旧文章可能会置顶，目前为发现置顶数超过10
    const infoList = $('body > div.container > div.ewb-white > div.ewb-job > ul > li')
        .toArray()
        .map((item) => ({
            title: $('a', item).attr('title'),
            url: `${rootUrl}${$('a', item).attr('href')}`,
        }));
    return infoList;
};

// 获取信息正文内容
const getInfoContent = (rootUrl, item) =>
    cache.tryGet(item.url, async () => {
        const response = await got(item.url);
        // 部分网页会跳转其他类型网站,则不解析，直接附超链接
        try {
            const $ = load(response.data);
            const fileList = $('#symbol > div:nth-child(4) > div > span > a')
                .toArray()
                .map((item) => ({
                    name: $(item).text(),
                    url: `${rootUrl}/${$(item).attr('href')}`,
                }));
            const rawDate = $('#symbol > div:nth-child(1) > div:nth-child(3)').text().split('：')[1].trim();
            return {
                title: $('#main').text().trim(),
                id: $('#symbol > div:nth-child(1) > div:nth-child(1)').text().split('：')[1].trim(),
                infoNum: $('#symbol > div:nth-child(1) > div:nth-child(2) > span').text().split('：')[1].trim(),
                pubDate: parseDate(timezone(rawDate, +8)),
                date: rawDate,
                keyWord: $('#symbol > div:nth-child(2) > div:nth-child(3)').text().split('：')[1].trim(),
                source: $('#symbol > div:nth-child(2) > div:nth-child(2)').text().split('：')[1].trim(),
                content: $('#container > div.ewb-white > div.ewb-article-detail').html(),
                file: fileList,
                link: item.url,
                _isCompleteInfo: true,
            };
        } catch {
            return {
                title: item.title,
                link: item.url,
                _isCompleteInfo: false,
            };
        }
    });

export const route: Route = {
    path: '/sichuan/deyang/govpublicinfo/:countyName/:infoType?',
    categories: ['government'],
    example: '/gov/sichuan/deyang/govpublicinfo/绵竹市',
    parameters: { countyName: '区县名（**其他区县整改中，暂时只支持`绵竹市`**）。德阳市、绵竹市、广汉市、什邡市、中江县、罗江区、旌阳区、高新区', infoType: '信息类型。默认值:fdzdnr-“法定主动内容”' },
    features: {
        requireConfig: false,
        requirePuppeteer: false,
        antiCrawler: false,
        supportBT: false,
        supportPodcast: false,
        supportScihub: false,
    },
    name: '政府公开信息',
    maintainers: ['zytomorrow'],
    handler,
    description: `| 法定主动内容 | 公示公告 |
  | :----------: | :------: |
  |    fdzdnr    |   gsgg   |`,
};

async function handler(ctx) {
    const countyName = ctx.req.param('countyName');
    const infoType = ctx.req.param('infoType') || 'fdzdnr';
    const infoBasicUrl = basicInfoDict[countyName].infoType[infoType].basicUrl;
    const rootUrl = basicInfoDict[countyName].rootUrl;
    const infoUrlList = await getInfoUrlList(rootUrl, infoBasicUrl);
    const items = await Promise.all(infoUrlList.map((item) => getInfoContent(rootUrl, item)));

    return {
        title: `政府公开信息-${countyName}-${basicInfoDict[countyName].infoType[infoType].name}`,
        link: infoBasicUrl,
        item: items.map((item) => ({
            title: item.title,
            description: art(path.join(__dirname, './templates/govPublicInfo.art'), { item }),
            link: item.link,
            pubDate: item.pubDate,
        })),
    };
}
