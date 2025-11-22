# @xenix/cap-audio-recorder

A Capacitor Audio Recorder Plugin for web, ios and android.

## Install

```bash
npm install @xenix/cap-audio-recorder
npx cap sync
```

## API

<docgen-index>

* [`start(...)`](#start)
* [`stop()`](#stop)
* [`pause()`](#pause)
* [`resume()`](#resume)
* [`setInputGain(...)`](#setinputgain)
* [`getCurrentState()`](#getcurrentstate)
* [`getCapabilities()`](#getcapabilities)
* [`checkPermissions()`](#checkpermissions)
* [`requestPermissions()`](#requestpermissions)
* [`addListener('stateChanged', ...)`](#addlistenerstatechanged-)
* [`addListener('audioUriReady', ...)`](#addlisteneraudiouriready-)
* [`addListener('durationChanged', ...)`](#addlistenerdurationchanged-)
* [`addListener(string, ...)`](#addlistenerstring-)
* [`removeAllListeners()`](#removealllisteners)
* [Interfaces](#interfaces)
* [Type Aliases](#type-aliases)

</docgen-index>

<docgen-api>
<!--Update the source file JSDoc comments and rerun docgen to update the docs below-->

### start(...)

```typescript
start(options?: RecorderOptions | undefined) => Promise<void>
```

| Param         | Type                                                        |
| ------------- | ----------------------------------------------------------- |
| **`options`** | <code><a href="#recorderoptions">RecorderOptions</a></code> |

--------------------


### stop()

```typescript
stop() => Promise<RecorderResult>
```

**Returns:** <code>Promise&lt;<a href="#recorderresult">RecorderResult</a>&gt;</code>

--------------------


### pause()

```typescript
pause() => Promise<void>
```

--------------------


### resume()

```typescript
resume() => Promise<void>
```

--------------------


### setInputGain(...)

```typescript
setInputGain(options: { value: number; }) => Promise<void>
```

| Param         | Type                            |
| ------------- | ------------------------------- |
| **`options`** | <code>{ value: number; }</code> |

--------------------


### getCurrentState()

```typescript
getCurrentState() => Promise<{ state: RecorderState; }>
```

**Returns:** <code>Promise&lt;{ state: <a href="#recorderstate">RecorderState</a>; }&gt;</code>

--------------------


### getCapabilities()

```typescript
getCapabilities() => Promise<RecorderCapabilities>
```

**Returns:** <code>Promise&lt;<a href="#recordercapabilities">RecorderCapabilities</a>&gt;</code>

--------------------


### checkPermissions()

```typescript
checkPermissions() => Promise<PermissionStatus>
```

**Returns:** <code>Promise&lt;<a href="#permissionstatus">PermissionStatus</a>&gt;</code>

--------------------


### requestPermissions()

```typescript
requestPermissions() => Promise<PermissionStatus>
```

**Returns:** <code>Promise&lt;<a href="#permissionstatus">PermissionStatus</a>&gt;</code>

--------------------


### addListener('stateChanged', ...)

```typescript
addListener(eventName: 'stateChanged', listenerFunc: (event: StateChangedEvent) => void) => Promise<PluginListenerHandle>
```

| Param              | Type                                                                                |
| ------------------ | ----------------------------------------------------------------------------------- |
| **`eventName`**    | <code>'stateChanged'</code>                                                         |
| **`listenerFunc`** | <code>(event: <a href="#statechangedevent">StateChangedEvent</a>) =&gt; void</code> |

**Returns:** <code>Promise&lt;<a href="#pluginlistenerhandle">PluginListenerHandle</a>&gt;</code>

--------------------


### addListener('audioUriReady', ...)

```typescript
addListener(eventName: 'audioUriReady', listenerFunc: (event: AudioUrlReadyEvent) => void) => Promise<PluginListenerHandle>
```

| Param              | Type                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------- |
| **`eventName`**    | <code>'audioUriReady'</code>                                                          |
| **`listenerFunc`** | <code>(event: <a href="#audiourlreadyevent">AudioUrlReadyEvent</a>) =&gt; void</code> |

**Returns:** <code>Promise&lt;<a href="#pluginlistenerhandle">PluginListenerHandle</a>&gt;</code>

--------------------


### addListener('durationChanged', ...)

```typescript
addListener(eventName: 'durationChanged', listenerFunc: (event: DurationChangedEvent) => void) => Promise<PluginListenerHandle>
```

| Param              | Type                                                                                      |
| ------------------ | ----------------------------------------------------------------------------------------- |
| **`eventName`**    | <code>'durationChanged'</code>                                                            |
| **`listenerFunc`** | <code>(event: <a href="#durationchangedevent">DurationChangedEvent</a>) =&gt; void</code> |

**Returns:** <code>Promise&lt;<a href="#pluginlistenerhandle">PluginListenerHandle</a>&gt;</code>

--------------------


### addListener(string, ...)

```typescript
addListener(eventName: string, listenerFunc: (event: any) => void) => Promise<PluginListenerHandle>
```

| Param              | Type                                 |
| ------------------ | ------------------------------------ |
| **`eventName`**    | <code>string</code>                  |
| **`listenerFunc`** | <code>(event: any) =&gt; void</code> |

**Returns:** <code>Promise&lt;<a href="#pluginlistenerhandle">PluginListenerHandle</a>&gt;</code>

--------------------


### removeAllListeners()

```typescript
removeAllListeners() => Promise<void>
```

--------------------


### Interfaces


#### RecorderOptions

| Prop               | Type                 |
| ------------------ | -------------------- |
| **`sampleRate`**   | <code>number</code>  |
| **`sampleSize`**   | <code>number</code>  |
| **`channelCount`** | <code>number</code>  |
| **`maxDuration`**  | <code>number</code>  |
| **`returnBase64`** | <code>boolean</code> |
| **`mimeType`**     | <code>string</code>  |
| **`inputGain`**    | <code>number</code>  |
| **`useWorklet`**   | <code>boolean</code> |
| **`workletUrl`**   | <code>string</code>  |


#### RecorderResult

| Prop           | Type                |
| -------------- | ------------------- |
| **`blob`**     | <code>string</code> |
| **`duration`** | <code>number</code> |
| **`mime`**     | <code>string</code> |
| **`uri`**      | <code>string</code> |


#### RecorderCapabilities

| Prop                    | Type                  |
| ----------------------- | --------------------- |
| **`supported`**         | <code>boolean</code>  |
| **`mimeTypes`**         | <code>string[]</code> |
| **`preferredMimeType`** | <code>string</code>   |
| **`sampleRates`**       | <code>number[]</code> |
| **`sampleSizes`**       | <code>number[]</code> |
| **`channelCounts`**     | <code>number[]</code> |


#### PermissionStatus

| Prop           | Type                                                                                                                      |
| -------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **`onchange`** | <code>((this: <a href="#permissionstatus">PermissionStatus</a>, ev: <a href="#event">Event</a>) =&gt; any) \| null</code> |
| **`state`**    | <code><a href="#permissionstate">PermissionState</a></code>                                                               |

| Method                  | Signature                                                                                                                                                                                                                                                       | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **addEventListener**    | &lt;K extends "change"&gt;(type: K, listener: (this: <a href="#permissionstatus">PermissionStatus</a>, ev: PermissionStatusEventMap[K]) =&gt; any, options?: boolean \| <a href="#addeventlisteneroptions">AddEventListenerOptions</a> \| undefined) =&gt; void | Appends an event listener for events whose type attribute value is type. The callback argument sets the callback that will be invoked when the event is dispatched. The options argument sets listener-specific options. For compatibility this can be a boolean, in which case the method behaves exactly as if the value was specified as options's capture. When set to true, options's capture prevents callback from being invoked when the event's eventPhase attribute value is BUBBLING_PHASE. When false (or not present), callback will not be invoked when event's eventPhase attribute value is CAPTURING_PHASE. Either way, callback will be invoked if event's eventPhase attribute value is AT_TARGET. When set to true, options's passive indicates that the callback will not cancel the event by invoking preventDefault(). This is used to enable performance optimizations described in § 2.8 Observing event listeners. When set to true, options's once indicates that the callback will only be invoked once after which the event listener will be removed. The event listener is appended to target's event listener list and is not appended if it has the same type, callback, and capture. |
| **addEventListener**    | (type: string, listener: <a href="#eventlisteneroreventlistenerobject">EventListenerOrEventListenerObject</a>, options?: boolean \| <a href="#addeventlisteneroptions">AddEventListenerOptions</a> \| undefined) =&gt; void                                     | Appends an event listener for events whose type attribute value is type. The callback argument sets the callback that will be invoked when the event is dispatched. The options argument sets listener-specific options. For compatibility this can be a boolean, in which case the method behaves exactly as if the value was specified as options's capture. When set to true, options's capture prevents callback from being invoked when the event's eventPhase attribute value is BUBBLING_PHASE. When false (or not present), callback will not be invoked when event's eventPhase attribute value is CAPTURING_PHASE. Either way, callback will be invoked if event's eventPhase attribute value is AT_TARGET. When set to true, options's passive indicates that the callback will not cancel the event by invoking preventDefault(). This is used to enable performance optimizations described in § 2.8 Observing event listeners. When set to true, options's once indicates that the callback will only be invoked once after which the event listener will be removed. The event listener is appended to target's event listener list and is not appended if it has the same type, callback, and capture. |
| **removeEventListener** | &lt;K extends "change"&gt;(type: K, listener: (this: <a href="#permissionstatus">PermissionStatus</a>, ev: PermissionStatusEventMap[K]) =&gt; any, options?: boolean \| <a href="#eventlisteneroptions">EventListenerOptions</a> \| undefined) =&gt; void       | Removes the event listener in target's event listener list with the same type, callback, and options.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **removeEventListener** | (type: string, listener: <a href="#eventlisteneroreventlistenerobject">EventListenerOrEventListenerObject</a>, options?: boolean \| <a href="#eventlisteneroptions">EventListenerOptions</a> \| undefined) =&gt; void                                           | Removes the event listener in target's event listener list with the same type, callback, and options.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |


#### PermissionStatusEventMap

| Prop           | Type                                    |
| -------------- | --------------------------------------- |
| **`"change"`** | <code><a href="#event">Event</a></code> |


#### Event

An event which takes place in the DOM.

| Prop                   | Type                                                        | Description                                                                                                                                                                                                                                                |
| ---------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`bubbles`**          | <code>boolean</code>                                        | Returns true or false depending on how event was initialized. True if event goes through its target's ancestors in reverse tree order, and false otherwise.                                                                                                |
| **`cancelBubble`**     | <code>boolean</code>                                        |                                                                                                                                                                                                                                                            |
| **`cancelable`**       | <code>boolean</code>                                        | Returns true or false depending on how event was initialized. Its return value does not always carry meaning, but true can indicate that part of the operation during which event was dispatched, can be canceled by invoking the preventDefault() method. |
| **`composed`**         | <code>boolean</code>                                        | Returns true or false depending on how event was initialized. True if event invokes listeners past a ShadowRoot node that is the root of its target, and false otherwise.                                                                                  |
| **`currentTarget`**    | <code><a href="#eventtarget">EventTarget</a> \| null</code> | Returns the object whose event listener's callback is currently being invoked.                                                                                                                                                                             |
| **`defaultPrevented`** | <code>boolean</code>                                        | Returns true if preventDefault() was invoked successfully to indicate cancelation, and false otherwise.                                                                                                                                                    |
| **`eventPhase`**       | <code>number</code>                                         | Returns the event's phase, which is one of NONE, CAPTURING_PHASE, AT_TARGET, and BUBBLING_PHASE.                                                                                                                                                           |
| **`isTrusted`**        | <code>boolean</code>                                        | Returns true if event was dispatched by the user agent, and false otherwise.                                                                                                                                                                               |
| **`returnValue`**      | <code>boolean</code>                                        |                                                                                                                                                                                                                                                            |
| **`srcElement`**       | <code><a href="#eventtarget">EventTarget</a> \| null</code> |                                                                                                                                                                                                                                                            |
| **`target`**           | <code><a href="#eventtarget">EventTarget</a> \| null</code> | Returns the object to which event is dispatched (its target).                                                                                                                                                                                              |
| **`timeStamp`**        | <code>number</code>                                         | Returns the event's timestamp as the number of milliseconds measured relative to the time origin.                                                                                                                                                          |
| **`type`**             | <code>string</code>                                         | Returns the type of event, e.g. "click", "hashchange", or "submit".                                                                                                                                                                                        |
| **`AT_TARGET`**        | <code>number</code>                                         |                                                                                                                                                                                                                                                            |
| **`BUBBLING_PHASE`**   | <code>number</code>                                         |                                                                                                                                                                                                                                                            |
| **`CAPTURING_PHASE`**  | <code>number</code>                                         |                                                                                                                                                                                                                                                            |
| **`NONE`**             | <code>number</code>                                         |                                                                                                                                                                                                                                                            |

| Method                       | Signature                                                                                    | Description                                                                                                                                                                                                                             |
| ---------------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **composedPath**             | () =&gt; EventTarget[]                                                                       | Returns the invocation target objects of event's path (objects on which listeners will be invoked), except for any nodes in shadow trees of which the shadow root's mode is "closed" that are not reachable from event's currentTarget. |
| **initEvent**                | (type: string, bubbles?: boolean \| undefined, cancelable?: boolean \| undefined) =&gt; void |                                                                                                                                                                                                                                         |
| **preventDefault**           | () =&gt; void                                                                                | If invoked when the cancelable attribute value is true, and while executing a listener for the event with passive set to false, signals to the operation that caused event to be dispatched that it needs to be canceled.               |
| **stopImmediatePropagation** | () =&gt; void                                                                                | Invoking this method prevents event from reaching any registered event listeners after the current one finishes running and, when dispatched in a tree, also prevents event from reaching any other objects.                            |
| **stopPropagation**          | () =&gt; void                                                                                | When dispatched in a tree, invoking this method prevents event from reaching any objects other than the current object.                                                                                                                 |


#### EventTarget

<a href="#eventtarget">EventTarget</a> is a DOM interface implemented by objects that can receive events and may have listeners for them.

| Method                  | Signature                                                                                                                                                                                                                           | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **addEventListener**    | (type: string, listener: <a href="#eventlisteneroreventlistenerobject">EventListenerOrEventListenerObject</a> \| null, options?: boolean \| <a href="#addeventlisteneroptions">AddEventListenerOptions</a> \| undefined) =&gt; void | Appends an event listener for events whose type attribute value is type. The callback argument sets the callback that will be invoked when the event is dispatched. The options argument sets listener-specific options. For compatibility this can be a boolean, in which case the method behaves exactly as if the value was specified as options's capture. When set to true, options's capture prevents callback from being invoked when the event's eventPhase attribute value is BUBBLING_PHASE. When false (or not present), callback will not be invoked when event's eventPhase attribute value is CAPTURING_PHASE. Either way, callback will be invoked if event's eventPhase attribute value is AT_TARGET. When set to true, options's passive indicates that the callback will not cancel the event by invoking preventDefault(). This is used to enable performance optimizations described in § 2.8 Observing event listeners. When set to true, options's once indicates that the callback will only be invoked once after which the event listener will be removed. The event listener is appended to target's event listener list and is not appended if it has the same type, callback, and capture. |
| **dispatchEvent**       | (event: <a href="#event">Event</a>) =&gt; boolean                                                                                                                                                                                   | Dispatches a synthetic event event to target and returns true if either event's cancelable attribute value is false or its preventDefault() method was not invoked, and false otherwise.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **removeEventListener** | (type: string, callback: <a href="#eventlisteneroreventlistenerobject">EventListenerOrEventListenerObject</a> \| null, options?: boolean \| <a href="#eventlisteneroptions">EventListenerOptions</a> \| undefined) =&gt; void       | Removes the event listener in target's event listener list with the same type, callback, and options.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |


#### EventListener


#### EventListenerObject

| Method          | Signature                                    |
| --------------- | -------------------------------------------- |
| **handleEvent** | (evt: <a href="#event">Event</a>) =&gt; void |


#### AddEventListenerOptions

| Prop          | Type                 |
| ------------- | -------------------- |
| **`once`**    | <code>boolean</code> |
| **`passive`** | <code>boolean</code> |


#### EventListenerOptions

| Prop          | Type                 |
| ------------- | -------------------- |
| **`capture`** | <code>boolean</code> |


#### PluginListenerHandle

| Prop         | Type                                      |
| ------------ | ----------------------------------------- |
| **`remove`** | <code>() =&gt; Promise&lt;void&gt;</code> |


#### StateChangedEvent

| Prop        | Type                                                    |
| ----------- | ------------------------------------------------------- |
| **`state`** | <code><a href="#recorderstate">RecorderState</a></code> |


#### AudioUrlReadyEvent


#### DurationChangedEvent

| Prop           | Type                |
| -------------- | ------------------- |
| **`duration`** | <code>number</code> |


### Type Aliases


#### RecorderState

<code>'inactive' | 'recording' | 'paused' | 'initializing' | 'error' | 'stopping'</code>


#### EventListenerOrEventListenerObject

<code><a href="#eventlistener">EventListener</a> | <a href="#eventlistenerobject">EventListenerObject</a></code>


#### PermissionState

<code>"denied" | "granted" | "prompt"</code>

</docgen-api>
