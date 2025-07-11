# Data format of MPC files
This document defines the format for the representation of the files produced in the Tokamak MPC setup ceremony.  
The MPC setup ceremony produces two outputs for each phase: a proof and an accumulator. Therefore, it generates four outputs in total: *phase1_proof_index.json*, *phase1_acc_index.json*, *phase2_proof_index.json*, and *phase2_acc_index.json*, where *index* denotes the contributor's sequence in the ceremony.

## A. phase1_proof_index.json Format Specification

This document defines the data format used for `phase1_proof_index.json`, which is a JSON representation of the zero-knowledge proof contributions made by a specific participant in Phase 1 of the Tokamak MPC setup ceremony. The format includes multiple non-interactive zero-knowledge proofs for elements $\alpha$, $x$, and $y$.

````
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃ 4 bytes                ┃  contributor_index          ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
````
### proof2_alpha

````
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃  G1_POINT_SIZE        ┃  alpha_r_g1                  ┃ { "x": "hex string", "y": "hex string" } ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃  G2_POINT_SIZE        ┃  pok_alpha                   ┃ { "x": "hex string", "y": "hex string" } ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃  64 bytes            ┃  v                            ┃  encoded as a 128-character hexadecimal string ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
````
### proof2_x
````
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃  G1_POINT_SIZE        ┃  x                           ┃ { "x": "hex string", "y": "hex string" } ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃  G2_POINT_SIZE        ┃  pok_x                       ┃ { "x": "hex string", "y": "hex string" } ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃  64 bytes            ┃  v                            ┃  encoded as a 128-character hexadecimal string ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
````

### proof2_y
````
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃  G1_POINT_SIZE        ┃  alpha_y                     ┃ { "x": "hex string", "y": "hex string" } ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃  G2_POINT_SIZE        ┃  pok_y                       ┃ { "x": "hex string", "y": "hex string" } ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃  64 bytes            ┃  v                            ┃  encoded as a 128-character hexadecimal string ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
````
The cryptographic curve is BLS12-381. https://datatracker.ietf.org/doc/html/draft-irtf-cfrg-pairing-friendly-curves-10

**`G1_POINT_SIZE`**
    - **Compressed:**`48 bytes`
    - **Uncompressed:**`96 bytes`
    
    This size determines how many bytes are used to store a point in the G1 group.
    
 **`G2_POINT_SIZE`**
    - **Compressed:** `96 bytes`
    - **Uncompressed:** `192 bytes`
    
    This size determines how many bytes are used to store a point in the G2 group.


## B. `phase1_acc_index.json` Format Specification

This document describes the structure of the accumulator file `phase1_acc_index.json`, used in Phase 1 of the Tokamak MPC setup ceremony. 

````
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃ 4 bytes                ┃  contributor_index          ┃  
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━┓━━━━━━━━━━━━━━━━━━━┓━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃  G1_POINT_SIZE            ┃  g1               ┃  The base points of the curve in \( G_1 \),                         ┃ 
┃                           ┃                   ┃ (X-coordinate ||  Y-coordinate) Represented as hexadecimal string.  ┃                    
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━┛━━━━━━━━━━━━━━━━━━━┛━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━┓━━━━━━━━━━━━━━━━━━━┓━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃  G2_POINT_SIZE            ┃  g2               ┃  The base points of the curve in \( G_2 \),                         ┃ 
┃                           ┃                   ┃ (X-coordinate ||  Y-coordinate) Represented as hexadecimal string.  ┃                    
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━┛━━━━━━━━━━━━━━━━━━━┛━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━┓━━━━━━━━━━━━━━━━━━━┓━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃ 4 bytes                   ┃  compress         ┃ string: "true" or "false"                      ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━┛━━━━━━━━━━━━━━━━━━━┛━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━┓━━━━━━━━━━━━━━━━━━━┓━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃ a_deg *(G1_POINT_SIZE +   ┃  alpha            ┃ G1_POINT_SIZE for \( G_1 \) + G2_POINT_SIZE for \( G_2 \)           ┃ 
┃          G2_POINT_SIZE )  ┃                   ┃     { "x": "hex string", "y": "hex string" }                        ┃                    
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━┛━━━━━━━━━━━━━━━━━━━┛━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━┓━━━━━━━━━━━━━━━━━━━┓━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃ x_deg *(G1_POINT_SIZE +   ┃  x                ┃ G1_POINT_SIZE for \( G_1 \) + G2_POINT_SIZE for \( G_2 \)           ┃ 
┃          G2_POINT_SIZE )  ┃                   ┃     { "x": "hex string", "y": "hex string" }                        ┃                    
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━┛━━━━━━━━━━━━━━━━━━━┛━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━┓━━━━━━━━━━━━━━━━━━━┓━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃ y_deg *G1_POINT_SIZE      ┃  y_g1             ┃    List of G1 points representing                         ┃           
┃                           ┃                   ┃       { "x": "hex string"|| "y": "hex string" }           ┃                    
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━┛━━━━━━━━━━━━━━━━━━━┛━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━┓━━━━━━━━━━━━━━━━━━━┓━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃ G2_POINT_SIZE             ┃  y_g2             ┃ { "x": "hex string", "y": "hex string" } ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━┛━━━━━━━━━━━━━━━━━━━┛━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓━━━━━━━━━━━━━━━━━━━┓━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃ a_deg * x_deg * G1_POINT_SIZE ┃  alpha_x          ┃    List of G1 points representing                         ┃           
┃                               ┃                   ┃       { "x": "hex string"|| "y": "hex string" }           ┃                    
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛━━━━━━━━━━━━━━━━━━━┛━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓━━━━━━━━━━━━━━━━━━━┓━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃ a_deg * y_deg * G1_POINT_SIZE ┃  alpha_y          ┃    List of G1 points representing                         ┃           
┃                               ┃                   ┃       { "x": "hex string"|| "y": "hex string" }           ┃                    
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛━━━━━━━━━━━━━━━━━━━┛━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓━━━━━━━━━━━━━━━━━━━┓━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃ x_deg * y_deg * G1_POINT_SIZE ┃  xy               ┃    List of G1 points representing                         ┃           
┃                               ┃                   ┃       { "x": "hex string"|| "y": "hex string" }           ┃                    
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛━━━━━━━━━━━━━━━━━━━┛━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓━━━━━━━━━━━━━━━━━━━┓━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃a_deg*x_deg*y_deg*G1_POINT_SIZE ┃  alpha_xy         ┃    List of G1 points representing                         ┃           
┃                                ┃                   ┃       { "x": "hex string"|| "y": "hex string" }           ┃                    
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛━━━━━━━━━━━━━━━━━━━┛━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
````

## C. phase2_proof_index.json Format Specification

This document specifies the structure and meaning of `phase2_proof_1.json`, which represents a participant's proof contribution in Phase 2 of the Tokamak MPC setup ceremony.

````
┏━━━━━━━━━━━━━━━━━━━━━━━━┓━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃ 4 bytes                ┃  contributor_index           ┃  
┗━━━━━━━━━━━━━━━━━━━━━━━━┛━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
┏━━━━━━━━━━━━━━━━━━━━━━━━┓━━━━━━━━━━━━━━━━━━━┓━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃  4 bytes               ┃  v                ┃ the challenge response for this contribution┃                    
┗━━━━━━━━━━━━━━━━━━━━━━━━┛━━━━━━━━━━━━━━━━━━━┛━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
┏━━━━━━━━━━━━━━━━━━━━━━━┓━━━━━━━━━━━━━━━━━━━━┓━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃  G1_POINT_SIZE        ┃  delta_t_g1        ┃ { "x": "hex string", "y": "hex string" } ┃
┗━━━━━━━━━━━━━━━━━━━━━━━┛━━━━━━━━━━━━━━━━━━━━┛━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
┏━━━━━━━━━━━━━━━━━━━━━━━┓━━━━━━━━━━━━━━━━━━━━┓━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃  G1_POINT_SIZE        ┃  gamma_t_g1        ┃ { "x": "hex string", "y": "hex string" } ┃
┗━━━━━━━━━━━━━━━━━━━━━━━┛━━━━━━━━━━━━━━━━━━━━┛━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
┏━━━━━━━━━━━━━━━━━━━━━━━┓━━━━━━━━━━━━━━━━━━━━┓━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃  G1_POINT_SIZE        ┃  eta_t_g1          ┃ { "x": "hex string", "y": "hex string" } ┃
┗━━━━━━━━━━━━━━━━━━━━━━━┛━━━━━━━━━━━━━━━━━━━━┛━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
┏━━━━━━━━━━━━━━━━━━━━━━━┓━━━━━━━━━━━━━━━━━━━━┓━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃  G2_POINT_SIZE        ┃  pok_delta         ┃ { "x": "hex string", "y": "hex string" } ┃
┗━━━━━━━━━━━━━━━━━━━━━━━┛━━━━━━━━━━━━━━━━━━━━┛━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
┏━━━━━━━━━━━━━━━━━━━━━━━┓━━━━━━━━━━━━━━━━━━━━┓━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃  G2_POINT_SIZE        ┃  pok_gamma         ┃ { "x": "hex string", "y": "hex string" } ┃
┗━━━━━━━━━━━━━━━━━━━━━━━┛━━━━━━━━━━━━━━━━━━━━┛━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
┏━━━━━━━━━━━━━━━━━━━━━━━┓━━━━━━━━━━━━━━━━━━━━┓━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃  G2_POINT_SIZE        ┃  pok_eta           ┃ { "x": "hex string", "y": "hex string" } ┃
┗━━━━━━━━━━━━━━━━━━━━━━━┛━━━━━━━━━━━━━━━━━━━━┛━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
┏━━━━━━━━━━━━━━━━━━━━━━━┓━━━━━━━━━━━━━━━━━━━━┓━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃  G2_POINT_SIZE        ┃  delta_t_g2        ┃ { "x": "hex string", "y": "hex string" } ┃
┗━━━━━━━━━━━━━━━━━━━━━━━┛━━━━━━━━━━━━━━━━━━━━┛━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
┏━━━━━━━━━━━━━━━━━━━━━━━┓━━━━━━━━━━━━━━━━━━━━┓━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃  G2_POINT_SIZE        ┃  gamma_t_g2        ┃ { "x": "hex string", "y": "hex string" } ┃
┗━━━━━━━━━━━━━━━━━━━━━━━┛━━━━━━━━━━━━━━━━━━━━┛━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
┏━━━━━━━━━━━━━━━━━━━━━━━┓━━━━━━━━━━━━━━━━━━━━┓━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃  G2_POINT_SIZE        ┃  eta_t_g2          ┃ { "x": "hex string", "y": "hex string" } ┃
┗━━━━━━━━━━━━━━━━━━━━━━━┛━━━━━━━━━━━━━━━ ━━━━┛━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
````

## D. `phase2_acc_index.json` Format Specification
This document defines the format for the accumulator file `phase2_acc_index.json`, used in Phase 2 of the Tokamak MPC setup ceremony. 
````
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃ 4 bytes                ┃  contributor_index          ┃  
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
````
### "sigma"
````
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━┓━━━━━━━━━━━━━━━━━━━┓━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃  G1_POINT_SIZE            ┃  G                ┃  The base points of the curve in \( G_1 \),                         ┃ 
┃                           ┃                   ┃ (X-coordinate ||  Y-coordinate) Represented as hexadecimal string.  ┃                    
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━┛━━━━━━━━━━━━━━━━━━━┛━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━┓━━━━━━━━━━━━━━━━━━━┓━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃  G2_POINT_SIZE            ┃  H                ┃  The base points of the curve in \( G_2 \),                         ┃ 
┃                           ┃                   ┃ (X-coordinate ||  Y-coordinate) Represented as hexadecimal string.  ┃                    
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━┛━━━━━━━━━━━━━━━━━━━┛━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
````

### "sigma_1"
````
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓━━━━━━━━━━━━━━━━━━━┓━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃ x_deg * y_deg * G1_POINT_SIZE ┃  xy_powers        ┃    List of G1 points representing                         ┃           
┃                               ┃                   ┃       { "x": "hex string"|| "y": "hex string" }           ┃                    
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛━━━━━━━━━━━━━━━━━━━┛━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━┓━━━━━━━━━━━━━━━━━━━┓━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃ x_deg *(G1_POINT_SIZE +   ┃  x                ┃ G1_POINT_SIZE for \( G_1 \) + G2_POINT_SIZE for \( G_2 \)     ┃ 
┃          G2_POINT_SIZE )  ┃                   ┃     { "x": "hex string", "y": "hex string" }                  ┃                    
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━┛━━━━━━━━━━━━━━━━━━━┛━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━┓━━━━━━━━━━━━━━━━━━━┓━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃ y_deg *G1_POINT_SIZE      ┃  y                ┃    List of G1 points representing                         ┃           
┃                           ┃                   ┃       { "x": "hex string"|| "y": "hex string" }           ┃                    
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━┛━━━━━━━━━━━━━━━━━━━┛━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
┏━━━━━━━━━━━━━━━━━━━━━━━┓━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃  G1_POINT_SIZE        ┃  delta                       ┃ { "x": "hex string", "y": "hex string" } ┃
┗━━━━━━━━━━━━━━━━━━━━━━━┛━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
┏━━━━━━━━━━━━━━━━━━━━━━━┓━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃  G1_POINT_SIZE        ┃  eta                         ┃ { "x": "hex string", "y": "hex string" } ┃
┗━━━━━━━━━━━━━━━━━━━━━━━┛━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃  l * G1_POINT_SIZE                 ┃  gamma_inv_o_inst                    ┃ { "x": "hex string", "y": "hex string" } ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃  s_max * m_l * G1_POINT_SIZE       ┃  eta_inv_li_o_inter_alpha4_kj        ┃ { "x": "hex string", "y": "hex string" } ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃  (m_D - l_D) * G1_POINT_SIZE       ┃  delta_inv_li_o_prv                  ┃ { "x": "hex string", "y": "hex string" } ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃  9 * G1_POINT_SIZE                 ┃  delta_inv_alphak_xh_tx              ┃ { "x": "hex string", "y": "hex string" } ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃  2 * G1_POINT_SIZE                 ┃  delta_inv_alpha4_xj_tx              ┃ { "x": "hex string", "y": "hex string" } ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃  12 * G1_POINT_SIZE                ┃  delta_inv_alphak_yi_ty              ┃ { "x": "hex string", "y": "hex string" } ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
````

### "sigma_2"
````
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━┓━━━━━━━━━━━━━━━━━━━┓━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃  G2_POINT_SIZE            ┃  alpha            ┃ { "x": "hex string", "y": "hex string" } ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━┛━━━━━━━━━━━━━━━━━━━┛━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━┓━━━━━━━━━━━━━━━━━━━┓━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃  G2_POINT_SIZE            ┃  alpha2           ┃ { "x": "hex string", "y": "hex string" } ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━┛━━━━━━━━━━━━━━━━━━━┛━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━┓━━━━━━━━━━━━━━━━━━━┓━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃  G2_POINT_SIZE            ┃  alpha3           ┃ { "x": "hex string", "y": "hex string" } ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━┛━━━━━━━━━━━━━━━━━━━┛━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━┓━━━━━━━━━━━━━━━━━━━┓━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃  G2_POINT_SIZE            ┃  alpha4           ┃ { "x": "hex string", "y": "hex string" } ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━┛━━━━━━━━━━━━━━━━━━━┛━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━┓━━━━━━━━━━━━━━━━━━━┓━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃  G2_POINT_SIZE            ┃  gamma            ┃ { "x": "hex string", "y": "hex string" } ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━┛━━━━━━━━━━━━━━━━━━━┛━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━┓━━━━━━━━━━━━━━━━━━━┓━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃  G2_POINT_SIZE            ┃  delta            ┃ { "x": "hex string", "y": "hex string" } ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━┛━━━━━━━━━━━━━━━━━━━┛━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━┓━━━━━━━━━━━━━━━━━━━┓━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃  G2_POINT_SIZE            ┃  x                ┃ { "x": "hex string", "y": "hex string" } ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━┛━━━━━━━━━━━━━━━━━━━┛━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━┓━━━━━━━━━━━━━━━━━━━┓━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃  G2_POINT_SIZE            ┃  y                ┃ { "x": "hex string", "y": "hex string" } ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━┛━━━━━━━━━━━━━━━━━━━┛━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━┓━━━━━━━━━━━━━━━━━━━┓━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃  G1_POINT_SIZE            ┃  gamma            ┃ { "x": "hex string", "y": "hex string" } ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━┛━━━━━━━━━━━━━━━━━━━┛━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
````

- $m_i = l_d - l$;

- for delta_inv_li_o_prv the calculation :  $( m_D - m_l - l = m_D - l_D )$