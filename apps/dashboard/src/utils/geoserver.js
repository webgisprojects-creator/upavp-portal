export const GEOSERVER_WFS_URL = "/geoserver/wfs";
export const PLOT_LAYOUT_LAYER = "AwasVikas:gda_plot_layout";

export function getPropertyValue(properties, propertyName) {
  const matchingKey = Object.keys(properties).find(
    (key) => key.toLowerCase() === propertyName.toLowerCase()
  );
  return matchingKey ? properties[matchingKey] : null;
}

export function escapeCqlString(value) {
  return value.replaceAll("'", "''");
}

export async function fetchWfsFeatures(parameters) {
  const query = new URLSearchParams(parameters);
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(`${GEOSERVER_WFS_URL}?${query}`, {
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`GeoServer request failed (${response.status}).`);
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("json")) {
      const responseText = await response.text();
      const exceptionText = responseText.match(
        /<(?:\w+:)?ExceptionText[^>]*>([\s\S]*?)<\/(?:\w+:)?ExceptionText>/i
      )?.[1];
      const detail = exceptionText
        ? exceptionText.replaceAll(/<[^>]+>/g, "").trim()
        : "";
      throw new Error(
        detail ||
          `GeoServer returned ${contentType || "an unknown response"}.`
      );
    }

    const data = await response.json();
    if (!Array.isArray(data.features)) {
      throw new Error("GeoServer returned an invalid feature collection.");
    }

    return data.features;
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error("GeoServer request timed out. Please try again.");
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}
