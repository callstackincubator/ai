// Images the tests send to models, as base64 PNG

// 32x32, solid red
export const redSquare =
  'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAIAAAD8GO2jAAAAJ0lEQVR42u3NsQkAAAjAsP7/tF7hIASyp6lTCQQCgUAgEAgEgi/BAjLD/C5w/SM9AAAAAElFTkSuQmCC'

// 480x160, the text INVOICE 4721 in black on white
export const invoice =
  'iVBORw0KGgoAAAANSUhEUgAAAeAAAACgCAAAAADxkOCRAAADPUlEQVR42u3d23KcMBBFUTqV///l' +
  'kxeXHSfASCAYA2u/uIoRl9GelloXypUJd+aXKiAYBINgEAyCQTAIJhgEg2AQDIJBMAgmGASDYBAM' +
  'gkEwCAbBBINgEAyCQTAIBsEEg2AQDIJBMAgGwQSDYBAMgkEwCAbBIJhgEAyCQTAIBsEgmGAQDIJB' +
  'MAgGwSCYYBAMgvFD+f3e29fH3/SUzjse8ar/hrey6ZvOfeuvY7Pa/j9Y3y6fF5VaC4Vr7lnz4gf1' +
  'WWL27K/Ta+2afb/OS0Zw9X+3LImp1YqqnsLDG5i5e9aD++D01t2rKqvqKNx307XStXJ6PSPJquZP' +
  'q+HE6rlLHe137QJVT8mia1tw14CrHV3HtXzsMnqPyqJTrXWXfyIjr0vX1m6hXp9WSylUXbD7HdMH' +
  '165iH/Wbpvzqo9Rn4TosQZh5wudOdFTPZ9/D4S+vDdKy1dG3S6dvzJvleyYPyaJrf5j0zoXk/V12' +
  'Yqqyq7HMG+65Y9IqT0qyVqY7KjNVV1suliENQTb/FOqSegdl0TNSUr01mDouU2proJsDOI9ZbMjP' +
  'GTBUi4CcNt6/Sx/cmO2cvCJTwwO4pquOln5NBxnO2NnBITWbt1/Agv+RIZ29AZwnTnR0RGp+Qv+8' +
  '5fSanrxlJ6uTVlPtrOAMS3K2BnBduIF++5adU2YwOhro6W5+R/TBrTGWC4w8spw/57mb7hZGw5+H' +
  'q6l8HZVbz6/h1sr2sFuMj07LomtMU1tvCeDL+x0jONOu1m9dYE6wXXeN31ERnE2TIHP7J7ok5OAA' +
  'voHfUU109m5ia06GjxiX1m3j98RhUhbyr8xtR19M1rJYuJpXmhcTtNxkfeEQwbOZcctiU3Vdu4Zt' +
  'yH/1bsRUl18KHptFZ0TprsNH98CTtwt31F66qjhH+qhp8vroxgBIz6a1tbmiHL/nLV4fHby9I227' +
  'MDYUPnfBOXd5ffSwma5c6nmn274fDEkWCAbBIBgEg2CCQTAIBsEgGASDYIJBMAgGwSAYBINggkEw' +
  'CAbBIBgEg2AQTDAIBsEgGASDYBBMMAgGwSAYBINgEAyCCQbBIBgEg2AQDIIJBsEgGASDYBAMggkG' +
  'wSAYBINgEIxG/gDc7rZP45cxQQAAAABJRU5ErkJggg=='

// QR code for the text HARNESS-42
export const qrCode =
  'iVBORw0KGgoAAAANSUhEUgAAAPgAAAD4CAAAAADkunTXAAAB8klEQVR42u3dWY7DIBAFQDqa+1+5' +
  'cwILaJZo5OLP0YydEkgvYJbI9s7yaeDg4ODg4ODg4ODg4ODg4ODg4ODg4ODg4ODg4ODg4ODg4ODg' +
  '4OD/oPyN/mEUH5AP98lLz1Pj4ODg4OByfD4no5jfu56nxsHBwcHB5fh8buZkv7wt9s9TjYODg4OD' +
  'y/FrJTblsBoHBwcHBwe/l+O9cfW4nOuaOjg4ODj4m3M8L813O9Vv19TBwcHBwd+Y49V55NX+dqhx' +
  'cHBwcHDwx5j89f7qv3pfrqmDg4ODg79x/XgWr1fnncem8XlNHRwcHBzc+/H5PF9dD56Dn9sHBhwc' +
  'HBy8GVfflqvV3wPV9+RyHBwcHBxcjtfnre3qn8fh+fOaOjg4ODh4M67eze822F8fHRfftf5cUwcH' +
  'BwcHtw/Mc772cn51flzYlxUcHBwcHPzaeWc5eb/o/L8aBwcHBwcHv3feWVucR5ebz0vR1MHBwcHB' +
  'nXc2//56dN56TI7Xm68ODg4ODi7Hz5UsrkOL4rmoahwcHBwcXI63Y+ed9a5z8X5qHBwcHBxcju8/' +
  '7ywm17GNrldT4+Dg4ODgcvz8eWez+8r0rqvfS1MHBwcHB2/OO1Pj4ODg4ODg4ODg4ODg4ODg4ODg' +
  '4ODg4ODg4ODg4ODg4ODg4ODg4CfLF6hBXQJHFBTBAAAAAElFTkSuQmCC'

export function base64ToBytes(base64: string) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}
