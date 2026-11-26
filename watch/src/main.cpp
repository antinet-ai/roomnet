// roomnet on the wrist: the light's switch and colour, through the agent's
// watch API (app/agent/src/rnet_agent/watch.py).

#include <LilyGoLib.h>
#include <LV_Helper.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

#if __has_include("secrets.h")
#include "secrets.h"
#else
#error "Copy src/secrets.example.h to src/secrets.h and fill it in"
#endif

static const uint32_t REFRESH_MS = 3000;
static const uint16_t HTTP_TIMEOUT_MS = 2500;

// The overview's light card offers the same six (app/web/components/DeviceCards.tsx):
// two whites by temperature, four colours by hue and saturation.
struct Preset {
    const char *name;
    uint16_t kelvin;  // 0 for a colour
    uint16_t hue;
    uint8_t saturation;
    uint32_t swatch;  // what the swatch looks like on screen
};
static const Preset PRESETS[] = {
    {"Warm white", 2700, 0, 0, 0xFDB772},
    {"Daylight", 6500, 0, 0, 0xE0EAFF},
    {"Red", 0, 0, 100, 0xFF2929},
    {"Amber", 0, 30, 100, 0xFF9429},
    {"Green", 0, 120, 80, 0x3EEA3E},
    {"Blue", 0, 200, 100, 0x29B8FF},
};
static const int PRESET_COUNT = sizeof(PRESETS) / sizeof(PRESETS[0]);

static lv_obj_t *status_label;
static lv_obj_t *light_switch;
static lv_obj_t *swatches[PRESET_COUNT];

// A person's tap waits here until loop() sends it, so LVGL's event
// callbacks never block on the network.
static const int SEND_SWITCH = -1;
static const int SEND_NOTHING = -2;
static int pending = SEND_NOTHING;  // a preset index, or one of the two above
static uint32_t last_refresh = 0;

static String url(const char *path)
{
    return String("http://") + ROOMNET_HOST + ":" + ROOMNET_PORT + path;
}

static void status(const char *text)
{
    lv_label_set_text(status_label, text);
}

// One request to the agent; the body of its answer, or why there is none.
static bool request(const char *method, const char *path, const String &body, String &answer)
{
    HTTPClient http;
    http.setTimeout(HTTP_TIMEOUT_MS);
    http.begin(url(path));
    http.addHeader("Authorization", String("Bearer ") + ROOMNET_TOKEN);
    if (body.length()) {
        http.addHeader("Content-Type", "application/json");
    }
    int code = http.sendRequest(method, body);
    answer = code > 0 ? http.getString() : http.errorToString(code);
    http.end();
    if (code == 401) {
        answer = "Token refused";
    } else if (code >= 400) {
        // The agent says what went wrong in one sentence under "detail".
        JsonDocument doc;
        if (!deserializeJson(doc, answer) && doc["detail"].is<const char *>()) {
            answer = doc["detail"].as<const char *>();
        }
    }
    return code >= 200 && code < 300;
}

// Which preset the light shows now, or -1; the same tolerance as the overview.
static int current_preset(JsonObject bulb)
{
    for (int i = 0; i < PRESET_COUNT; i++) {
        const Preset &p = PRESETS[i];
        if (p.kelvin) {
            if (bulb["kelvin"].as<int>() == p.kelvin) return i;
        } else if (bulb["kelvin"].isNull() && !bulb["hue"].isNull()) {
            if (abs(bulb["hue"].as<int>() - p.hue) <= 4 && abs(bulb["saturation"].as<int>() - p.saturation) <= 8) return i;
        }
    }
    return -1;
}

static void show(JsonObject bulb)
{
    bool known = !bulb["on"].isNull();
    bool on = known && bulb["on"].as<bool>();
    if (known) {
        lv_obj_clear_state(light_switch, LV_STATE_DISABLED);
    } else {
        lv_obj_add_state(light_switch, LV_STATE_DISABLED);
    }
    if (on) {
        lv_obj_add_state(light_switch, LV_STATE_CHECKED);
    } else {
        lv_obj_clear_state(light_switch, LV_STATE_CHECKED);
    }
    int selected = on ? current_preset(bulb) : -1;
    for (int i = 0; i < PRESET_COUNT; i++) {
        // A colour is set on a light that is on, as on the overview.
        if (on) {
            lv_obj_clear_state(swatches[i], LV_STATE_DISABLED);
        } else {
            lv_obj_add_state(swatches[i], LV_STATE_DISABLED);
        }
        if (i == selected) {
            lv_obj_add_state(swatches[i], LV_STATE_CHECKED);
        } else {
            lv_obj_clear_state(swatches[i], LV_STATE_CHECKED);
        }
    }
    status(bulb["problem"].is<const char *>() ? bulb["problem"].as<const char *>() : "");
}

static void refresh()
{
    last_refresh = millis();
    String answer;
    if (!request("GET", "/watch/state", "", answer)) {
        status(answer.c_str());
        return;
    }
    JsonDocument doc;
    if (deserializeJson(doc, answer)) {
        status("Unreadable answer");
        return;
    }
    show(doc["bulb"]);
}

static void send_pending()
{
    JsonDocument doc;
    const char *path;
    if (pending == SEND_SWITCH) {
        path = "/watch/bulb";
        doc["on"] = lv_obj_has_state(light_switch, LV_STATE_CHECKED);
    } else {
        const Preset &p = PRESETS[pending];
        if (p.kelvin) {
            path = "/watch/bulb/white";
            doc["kelvin"] = p.kelvin;
        } else {
            path = "/watch/bulb/colour";
            doc["hue"] = p.hue;
            doc["saturation"] = p.saturation;
        }
    }
    pending = SEND_NOTHING;
    String body, answer;
    serializeJson(doc, body);
    status("...");
    lv_refr_now(NULL);
    if (!request("POST", path, body, answer)) {
        status(answer.c_str());
    }
    // Show what the light did, not what was tapped.
    refresh();
}

static void on_switch(lv_event_t *e)
{
    pending = SEND_SWITCH;
}

static void on_swatch(lv_event_t *e)
{
    pending = (int)(intptr_t)lv_event_get_user_data(e);
}

static void build_screen()
{
    lv_obj_t *screen = lv_scr_act();
    lv_obj_set_style_bg_color(screen, lv_color_black(), 0);
    lv_obj_set_style_text_color(screen, lv_color_white(), 0);
    lv_obj_set_style_pad_all(screen, 16, 0);
    lv_obj_set_style_pad_row(screen, 18, 0);
    lv_obj_set_flex_flow(screen, LV_FLEX_FLOW_COLUMN);
    lv_obj_clear_flag(screen, LV_OBJ_FLAG_SCROLLABLE);

    lv_obj_t *top = lv_obj_create(screen);
    lv_obj_remove_style_all(top);
    lv_obj_set_size(top, LV_PCT(100), LV_SIZE_CONTENT);
    lv_obj_set_flex_flow(top, LV_FLEX_FLOW_ROW);
    lv_obj_set_flex_align(top, LV_FLEX_ALIGN_SPACE_BETWEEN, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
    lv_obj_t *title = lv_label_create(top);
    lv_label_set_text(title, "roomnet");
    lv_obj_set_style_text_font(title, &lv_font_montserrat_14, 0);
    lv_obj_set_style_text_color(title, lv_palette_main(LV_PALETTE_GREY), 0);
    status_label = lv_label_create(top);
    lv_obj_set_width(status_label, 120);
    lv_label_set_long_mode(status_label, LV_LABEL_LONG_DOT);
    lv_obj_set_style_text_align(status_label, LV_TEXT_ALIGN_RIGHT, 0);
    lv_obj_set_style_text_font(status_label, &lv_font_montserrat_12, 0);
    lv_obj_set_style_text_color(status_label, lv_palette_main(LV_PALETTE_ORANGE), 0);

    lv_obj_t *row = lv_obj_create(screen);
    lv_obj_remove_style_all(row);
    lv_obj_set_size(row, LV_PCT(100), LV_SIZE_CONTENT);
    lv_obj_set_flex_flow(row, LV_FLEX_FLOW_ROW);
    lv_obj_set_flex_align(row, LV_FLEX_ALIGN_SPACE_BETWEEN, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
    lv_obj_t *label = lv_label_create(row);
    lv_label_set_text(label, "Light");
    lv_obj_set_style_text_font(label, &lv_font_montserrat_26, 0);
    light_switch = lv_switch_create(row);
    lv_obj_set_size(light_switch, 74, 38);
    lv_obj_add_state(light_switch, LV_STATE_DISABLED);
    lv_obj_add_event_cb(light_switch, on_switch, LV_EVENT_VALUE_CHANGED, NULL);

    lv_obj_t *grid = lv_obj_create(screen);
    lv_obj_remove_style_all(grid);
    lv_obj_set_size(grid, LV_PCT(100), LV_SIZE_CONTENT);
    lv_obj_set_flex_flow(grid, LV_FLEX_FLOW_ROW_WRAP);
    lv_obj_set_flex_align(grid, LV_FLEX_ALIGN_SPACE_BETWEEN, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
    lv_obj_set_style_pad_row(grid, 14, 0);
    for (int i = 0; i < PRESET_COUNT; i++) {
        lv_obj_t *swatch = lv_btn_create(grid);
        lv_obj_remove_style_all(swatch);
        lv_obj_set_size(swatch, 58, 58);
        lv_obj_set_style_radius(swatch, LV_RADIUS_CIRCLE, 0);
        lv_obj_set_style_bg_opa(swatch, LV_OPA_COVER, 0);
        lv_obj_set_style_bg_color(swatch, lv_color_hex(PRESETS[i].swatch), 0);
        // The colour the light shows now gets a white ring, as on the overview.
        lv_obj_set_style_outline_color(swatch, lv_color_white(), LV_STATE_CHECKED);
        lv_obj_set_style_outline_width(swatch, 3, LV_STATE_CHECKED);
        lv_obj_set_style_outline_pad(swatch, 3, LV_STATE_CHECKED);
        lv_obj_set_style_opa(swatch, LV_OPA_40, LV_STATE_DISABLED);
        lv_obj_set_style_transform_width(swatch, -4, LV_STATE_PRESSED);
        lv_obj_set_style_transform_height(swatch, -4, LV_STATE_PRESSED);
        lv_obj_add_state(swatch, LV_STATE_DISABLED);
        lv_obj_add_event_cb(swatch, on_swatch, LV_EVENT_CLICKED, (void *)(intptr_t)i);
        swatches[i] = swatch;
    }
}

void setup()
{
    Serial.begin(115200);
    watch.begin();
    beginLvglHelper();
    build_screen();

    status("Joining WiFi...");
    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
}

void loop()
{
    lv_task_handler();
    if (WiFi.status() != WL_CONNECTED) {
        static uint32_t last_note = 0;
        if (millis() - last_note > 1000) {
            last_note = millis();
            status("Joining WiFi...");
        }
    } else if (pending != SEND_NOTHING) {
        send_pending();
    } else if (millis() - last_refresh > REFRESH_MS) {
        refresh();
    }
    delay(5);
}
