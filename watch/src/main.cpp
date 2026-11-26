// roomnet on the wrist: switch the bulb and the plug through the agent's
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

static lv_obj_t *status_label;
static lv_obj_t *bulb_switch;
static lv_obj_t *bulb_slider;
static lv_obj_t *plug_switch;
static lv_obj_t *plug_watts;

// A person's change waits here until loop() sends it, so LVGL's event
// callbacks never block on the network.
enum Pending { NONE, BULB_SWITCH, BULB_BRIGHTNESS, PLUG_SWITCH };
static Pending pending = NONE;
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

static void set_switch(lv_obj_t *sw, JsonVariant on)
{
    if (on.isNull()) {
        lv_obj_add_state(sw, LV_STATE_DISABLED);
        return;
    }
    lv_obj_clear_state(sw, LV_STATE_DISABLED);
    if (on.as<bool>()) {
        lv_obj_add_state(sw, LV_STATE_CHECKED);
    } else {
        lv_obj_clear_state(sw, LV_STATE_CHECKED);
    }
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
    JsonObject bulb = doc["bulb"], plug = doc["plug"];
    set_switch(bulb_switch, bulb["on"]);
    if (!bulb["brightness"].isNull() && !lv_slider_is_dragged(bulb_slider)) {
        lv_slider_set_value(bulb_slider, bulb["brightness"].as<int>(), LV_ANIM_OFF);
    }
    set_switch(plug_switch, plug["on"]);
    if (plug["watts"].isNull()) {
        lv_label_set_text(plug_watts, "");
    } else {
        lv_label_set_text_fmt(plug_watts, "%.1f W", plug["watts"].as<float>());
    }
    const char *problem = !bulb["problem"].isNull() ? bulb["problem"] : plug["problem"];
    status(problem ? problem : "");
}

static void send_pending()
{
    JsonDocument doc;
    const char *path;
    switch (pending) {
    case BULB_SWITCH:
        path = "/watch/bulb";
        doc["on"] = lv_obj_has_state(bulb_switch, LV_STATE_CHECKED);
        break;
    case BULB_BRIGHTNESS:
        path = "/watch/bulb/brightness";
        doc["brightness"] = lv_slider_get_value(bulb_slider);
        break;
    case PLUG_SWITCH:
        path = "/watch/plug";
        doc["on"] = lv_obj_has_state(plug_switch, LV_STATE_CHECKED);
        break;
    default:
        return;
    }
    pending = NONE;
    String body, answer;
    serializeJson(doc, body);
    status("...");
    lv_refr_now(NULL);
    if (!request("POST", path, body, answer)) {
        status(answer.c_str());
    }
    // Show what the device did, not what the switch was moved to.
    refresh();
}

static void on_change(lv_event_t *e)
{
    pending = (Pending)(intptr_t)lv_event_get_user_data(e);
}

static lv_obj_t *row(lv_obj_t *parent, const char *name)
{
    lv_obj_t *r = lv_obj_create(parent);
    lv_obj_remove_style_all(r);
    lv_obj_set_size(r, LV_PCT(100), LV_SIZE_CONTENT);
    lv_obj_set_flex_flow(r, LV_FLEX_FLOW_ROW);
    lv_obj_set_flex_align(r, LV_FLEX_ALIGN_SPACE_BETWEEN, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
    lv_obj_t *label = lv_label_create(r);
    lv_label_set_text(label, name);
    lv_obj_set_style_text_font(label, &lv_font_montserrat_22, 0);
    return r;
}

static lv_obj_t *add_switch(lv_obj_t *parent, Pending what)
{
    lv_obj_t *sw = lv_switch_create(parent);
    lv_obj_set_size(sw, 70, 36);
    lv_obj_add_state(sw, LV_STATE_DISABLED);
    lv_obj_add_event_cb(sw, on_change, LV_EVENT_VALUE_CHANGED, (void *)(intptr_t)what);
    return sw;
}

static void build_screen()
{
    lv_obj_t *screen = lv_scr_act();
    lv_obj_set_style_bg_color(screen, lv_color_black(), 0);
    lv_obj_set_style_text_color(screen, lv_color_white(), 0);
    lv_obj_set_style_pad_all(screen, 14, 0);
    lv_obj_set_style_pad_row(screen, 14, 0);
    lv_obj_set_flex_flow(screen, LV_FLEX_FLOW_COLUMN);

    lv_obj_t *title = lv_label_create(screen);
    lv_label_set_text(title, "roomnet");
    lv_obj_set_style_text_font(title, &lv_font_montserrat_16, 0);
    lv_obj_set_style_text_color(title, lv_palette_main(LV_PALETTE_GREY), 0);

    bulb_switch = add_switch(row(screen, "Bulb"), BULB_SWITCH);

    bulb_slider = lv_slider_create(screen);
    lv_obj_set_width(bulb_slider, LV_PCT(95));
    lv_obj_set_style_pad_all(bulb_slider, 4, LV_PART_KNOB);
    lv_slider_set_range(bulb_slider, 1, 100);
    // Sent once on release, not on every step of the drag.
    lv_obj_add_event_cb(bulb_slider, on_change, LV_EVENT_RELEASED, (void *)(intptr_t)BULB_BRIGHTNESS);

    lv_obj_t *plug_row = row(screen, "Plug");
    plug_watts = lv_label_create(plug_row);
    lv_label_set_text(plug_watts, "");
    plug_switch = add_switch(plug_row, PLUG_SWITCH);

    status_label = lv_label_create(screen);
    lv_obj_set_width(status_label, LV_PCT(100));
    lv_label_set_long_mode(status_label, LV_LABEL_LONG_WRAP);
    lv_obj_set_style_text_font(status_label, &lv_font_montserrat_12, 0);
    lv_obj_set_style_text_color(status_label, lv_palette_main(LV_PALETTE_ORANGE), 0);
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
    } else if (pending != NONE) {
        send_pending();
    } else if (millis() - last_refresh > REFRESH_MS) {
        refresh();
    }
    delay(5);
}
